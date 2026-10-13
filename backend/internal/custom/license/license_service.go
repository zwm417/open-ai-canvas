package license

import (
	"context"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	SessionMaxAge = 30 * 24 * time.Hour
)

type Service struct {
	db       *gorm.DB
	client   *Client
	category int
}

func NewService(db *gorm.DB) *Service {
	return &Service{
		db:       db,
		client:   NewClient(),
		category: CategoryMediaLab, // 默认 Category: 1 (智影创作)
	}
}

type ActivateLoginResult struct {
	User          model.User   `json:"user"`
	License       *UserLicense `json:"license"`
	Session       string       `json:"session"`
	MaxAgeSecs    int          `json:"maxAgeSecs"`
	IsNewUser     bool         `json:"isNewUser"`
	GrantedMicros int64        `json:"grantedMicros"`
}

// ActivateAndLogin 输入激活码一键完成“鉴权核验 -> 自动注册/绑定 -> 会话签发”
func (s *Service) ActivateAndLogin(ctx context.Context, activationCode, deviceID string, kickOtherSessions bool) (*ActivateLoginResult, error) {
	normCode := strings.TrimSpace(activationCode)
	if normCode == "" {
		return nil, errors.New("请输入激活码")
	}

	// 1. 请求远程授权中心进行鉴权校验
	remoteRes, err := s.client.Activate(ctx, normCode, deviceID, s.category)
	if err != nil {
		return nil, err
	}
	if !remoteRes.OK {
		return nil, fmt.Errorf("激活失败: %s", remoteRes.Message)
	}

	codeHash := HashCode(normCode)
	now := time.Now()
	var (
		targetUser    model.User
		targetLicense UserLicense
		isNewUser     bool
		grantedMicros int64
		sessionToken  string
		sessionID     string
	)

	// 2. 数据库事务：原子化处理用户创建与 License 绑定
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// 检查该激活码是否已在本地建立过绑定
		var existingLic UserLicense
		err := tx.Where("license_code = ?", codeHash).First(&existingLic).Error

		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("查询本地授权状态失败: %w", err)
		}

		if err == nil {
			// ─── 场景 A：已有绑定用户（老用户二次登录或换设备） ───
			if err := tx.Where("id = ?", existingLic.UserID).First(&targetUser).Error; err != nil {
				return fmt.Errorf("读取关联账户失败: %w", err)
			}
			if targetUser.Status != model.UserStatusActive {
				return errors.New("该激活码关联的账号已被禁用，请联系管理员")
			}

			// 更新授权快照
			existingLic.Status = "active"
			existingLic.LastCheckedAt = now
			existingLic.Tier = remoteRes.Tier
			if remoteRes.ExpiresAt != nil {
				existingLic.ExpiresAt = remoteRes.ExpiresAt
			}
			if payloadBytes, err := json.Marshal(remoteRes.RawPayload); err == nil {
				existingLic.RemotePayload = string(payloadBytes)
			}
			existingLic.UpdatedAt = now
			if err := tx.Save(&existingLic).Error; err != nil {
				return fmt.Errorf("更新本地授权记录失败: %w", err)
			}
			targetLicense = existingLic
		} else {
			// ─── 场景 B：首次激活（无对应用户，自动原子化建号） ───
			isNewUser = true
			newUserID := kernel.NewID()
			baseUsername := fmt.Sprintf("act_%s", codeHash[:8])
			username := baseUsername

			// 防止极罕见哈希前缀碰撞
			var conflictCount int64
			if err := tx.Model(&model.User{}).Where("username = ?", username).Count(&conflictCount).Error; err == nil && conflictCount > 0 {
				username = fmt.Sprintf("act_%s_%s", codeHash[:6], randomShortString(4))
			}

			// 生成高强度随机初始口令
			randomPwd := randomShortString(16)
			pwdHash, err := bcrypt.GenerateFromPassword([]byte(randomPwd), bcrypt.DefaultCost)
			if err != nil {
				return fmt.Errorf("生成用户凭证哈希失败: %w", err)
			}

			targetUser = model.User{
				ID:           newUserID,
				Username:     username,
				DisplayName:  "智影创作者",
				Role:         model.UserRoleUser,
				Status:       model.UserStatusActive,
				PasswordHash: string(pwdHash),
				LastLoginAt:  &now,
				CreatedAt:    now,
				UpdatedAt:    now,
			}
			if err := tx.Create(&targetUser).Error; err != nil {
				return fmt.Errorf("自动创建用户记录失败: %w", err)
			}

			payloadStr := ""
			if payloadBytes, err := json.Marshal(remoteRes.RawPayload); err == nil {
				payloadStr = string(payloadBytes)
			}

			targetLicense = UserLicense{
				ID:            kernel.NewID(),
				UserID:        newUserID,
				LicenseCode:   codeHash,
				LicenseMasked: MaskLicenseCode(normCode),
				Category:      s.category,
				Tier:          remoteRes.Tier,
				Status:        "active",
				ExpiresAt:     remoteRes.ExpiresAt,
				LastCheckedAt: now,
				RemotePayload: payloadStr,
				CreatedAt:     now,
				UpdatedAt:     now,
			}
			if err := tx.Create(&targetLicense).Error; err != nil {
				return fmt.Errorf("保存授权映射记录失败: %w", err)
			}

			// 自动赠送新用户微积分（严格以授权中心卡密配置的初始积分为准）
			signupBonusMicros := remoteRes.InitialCredits
			if signupBonusMicros > 0 {
				if err := grantCreditsInTx(tx, newUserID, signupBonusMicros, "license:"+targetLicense.ID, "激活码专享微积分额度"); err == nil {
					grantedMicros = signupBonusMicros
				}
			}
		}

		// 3. 在线会话互斥策略 (Kick-out)：删除该用户的其他历史活跃会话，防止多开共享
		if kickOtherSessions {
			_ = tx.Where("user_id = ?", targetUser.ID).Delete(&model.AuthSession{}).Error
		}

		// 4. 为当前用户签发新的合法 AuthSession
		sessionToken = generateRandomToken()
		sessionID = kernel.NewID()
		authSession := model.AuthSession{
			ID:        sessionID,
			UserID:    targetUser.ID,
			TokenHash: hashToken(sessionToken),
			ExpiresAt: now.Add(SessionMaxAge),
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := tx.Create(&authSession).Error; err != nil {
			return fmt.Errorf("创建会话凭证失败: %w", err)
		}

		// 更新最后登录时间
		targetUser.LastLoginAt = &now
		_ = tx.Model(&model.User{}).Where("id = ?", targetUser.ID).Update("last_login_at", now).Error

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &ActivateLoginResult{
		User:          targetUser,
		License:       &targetLicense,
		Session:       sessionID + "." + sessionToken,
		MaxAgeSecs:    int(SessionMaxAge.Seconds()),
		IsNewUser:     isNewUser,
		GrantedMicros: grantedMicros,
	}, nil
}

// GetUserLicense 查询当前用户的授权与到期状态
func (s *Service) GetUserLicense(userID string) (*UserLicense, error) {
	var lic UserLicense
	err := s.db.Where("user_id = ?", userID).Order("created_at DESC").First(&lic).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &lic, nil
}

// BindLicenseToExistingUser 已有老用户在个人中心兑换新激活码续期
func (s *Service) BindLicenseToExistingUser(ctx context.Context, userID, activationCode, deviceID string) (*UserLicense, error) {
	normCode := strings.TrimSpace(activationCode)
	if normCode == "" {
		return nil, errors.New("请输入激活码")
	}

	remoteRes, err := s.client.Activate(ctx, normCode, deviceID, s.category)
	if err != nil {
		return nil, err
	}
	if !remoteRes.OK {
		return nil, fmt.Errorf("兑换失败: %s", remoteRes.Message)
	}

	codeHash := HashCode(normCode)
	now := time.Now()
	var updatedLic UserLicense

	err = s.db.Transaction(func(tx *gorm.DB) error {
		var existing UserLicense
		if err := tx.Where("license_code = ?", codeHash).First(&existing).Error; err == nil {
			if existing.UserID != userID {
				return errors.New("该激活码已被其他账号兑换使用")
			}
			// 刷新状态
			existing.Status = "active"
			existing.LastCheckedAt = now
			existing.ExpiresAt = remoteRes.ExpiresAt
			existing.Tier = remoteRes.Tier
			existing.UpdatedAt = now
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
			updatedLic = existing
			return nil
		}

		payloadStr := ""
		if payloadBytes, err := json.Marshal(remoteRes.RawPayload); err == nil {
			payloadStr = string(payloadBytes)
		}

		updatedLic = UserLicense{
			ID:            kernel.NewID(),
			UserID:        userID,
			LicenseCode:   codeHash,
			LicenseMasked: MaskLicenseCode(normCode),
			Category:      s.category,
			Tier:          remoteRes.Tier,
			Status:        "active",
			ExpiresAt:     remoteRes.ExpiresAt,
			LastCheckedAt: now,
			RemotePayload: payloadStr,
			CreatedAt:     now,
			UpdatedAt:     now,
		}
		if err := tx.Create(&updatedLic).Error; err != nil {
			return err
		}

		// 充值微积分
		if remoteRes.InitialCredits > 0 {
			_ = grantCreditsInTx(tx, userID, remoteRes.InitialCredits, "license:"+updatedLic.ID, "激活码兑换微积分")
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return &updatedLic, nil
}

// ─── 内部辅助函数 ───

func HashCode(code string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(sum[:])
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func generateRandomToken() string {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		sum := md5.Sum([]byte(fmt.Sprintf("%d_%s", time.Now().UnixNano(), kernel.NewID())))
		return hex.EncodeToString(sum[:])
	}
	return hex.EncodeToString(b[:])
}

func randomShortString(length int) string {
	b := make([]byte, length/2+1)
	_, _ = rand.Read(b)
	str := hex.EncodeToString(b)
	if len(str) > length {
		return str[:length]
	}
	return str
}

func grantCreditsInTx(tx *gorm.DB, userID string, amount int64, refKey string, note string) error {
	account := model.CreditAccount{UserID: userID}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
		return err
	}

	entry := model.CreditLedgerEntry{
		ID:                 kernel.NewID(),
		UserID:             userID,
		Type:               model.CreditLedgerRedeem,
		AmountMicrocredits: amount,
		ReferenceKey:       &refKey,
		Note:               note,
		CreatedAt:          time.Now(),
	}
	created := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "reference_key"}}, DoNothing: true}).Create(&entry)
	if created.Error != nil {
		return created.Error
	}
	if created.RowsAffected == 0 {
		return nil // 幂等已存在
	}

	return tx.Model(&model.CreditAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
		"available_microcredits": gorm.Expr("available_microcredits + ?", amount),
		"version":                gorm.Expr("version + 1"),
		"updated_at":             time.Now(),
	}).Error
}
