// @opc-adapter: auto-promote-local-resource-to-oss [start]
package app

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"infinite-canvas/backend/internal/model"
)

// ensureResourceOnActiveOSS 检查资源是否仍位于本地存储；
// 当系统或用户已配置并启用有效对象存储（OSS/S3/COS/Kodo）时，自动将本地磁盘文件透明上传至活跃对象存储，
// 并同步更新数据库记录，从而确保外部 AI 模型生成或公网素材拉取能够直接获取合法的公网 HTTPS 签名地址。
func (s *Service) ensureResourceOnActiveOSS(resource *model.Resource) (bool, error) {
	if resource == nil || resource.Provider != "local" {
		return false, nil
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()

	// 加锁后二次确认 provider，防止并发重复上传
	if resource.Provider != "local" {
		return false, nil
	}

	setting, storageSettingID, useOSS, err := s.activeResourceOSSSetting(resource.UserID)
	if err != nil || !useOSS {
		return false, err
	}

	localPath := filepath.Join(s.dataDir, "resources", filepath.FromSlash(resource.ObjectKey))
	file, err := os.Open(localPath)
	if err != nil {
		return false, fmt.Errorf("读取本地资源文件失败：%w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return false, fmt.Errorf("获取本地资源信息失败：%w", err)
	}
	size := resource.Size
	if size <= 0 {
		size = stat.Size()
	}

	now := time.Now()
	fileName := filepath.Base(resource.ObjectKey)
	newKey := ossObjectKey(setting, resource.UserID, resource.Kind, fileName, resource.MimeType, now)

	etag, putErr := putOSSObject(setting, newKey, resource.MimeType, size, file)
	if putErr != nil {
		return false, fmt.Errorf("上传本地资源至对象存储失败：%w", putErr)
	}

	resource.Provider = setting.Provider
	resource.Endpoint = setting.Endpoint
	resource.Bucket = setting.Bucket
	resource.StorageSettingID = storageSettingID
	resource.ObjectKey = newKey
	if etag != "" {
		resource.ETag = etag
	}
	resource.UpdatedAt = now

	if saveErr := s.repo.SaveResource(resource); saveErr != nil {
		log.Printf("[OSS 自动晋升] 资源已上传至 OSS 但更新数据库记录失败 (id=%s): %v", resource.ID, saveErr)
	} else {
		log.Printf("[OSS 自动晋升] 成功将本地资源晋升至对象存储: id=%s provider=%s key=%s", resource.ID, setting.Provider, newKey)
	}
	return true, nil
}

// BackfillLocalResourceOSSPromotion 在系统启动时扫描存量本地存储资源，
// 若已配置且启用对象存储，则在后台渐进式上传并迁移记录，消除历史本地素材不可被公网 AI 调用的断层。
func (s *Service) BackfillLocalResourceOSSPromotion() {
	_, systemSetting, err := s.readOSSSetting()
	if err != nil || !systemSetting.Enabled {
		return
	}

	for {
		resources, err := s.repo.ReadyLocalResources(20)
		if err != nil || len(resources) == 0 {
			break
		}
		promotedCount := 0
		for i := range resources {
			promoted, err := s.ensureResourceOnActiveOSS(&resources[i])
			if err != nil {
				log.Printf("[OSS 自动晋升] 启动后台回填资源 %s 失败：%v", resources[i].ID, err)
				continue
			}
			if promoted {
				promotedCount++
			}
		}
		if promotedCount == 0 {
			break
		}
	}
}
// @opc-adapter: auto-promote-local-resource-to-oss [end]
