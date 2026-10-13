package license

import (
	"strings"
	"time"

	"gorm.io/gorm"
)

// UserLicense 记录激活码与智影用户的绑定映射与授权生命周期快照
type UserLicense struct {
	ID            string     `gorm:"primaryKey;size:36" json:"id"`
	UserID        string     `gorm:"index;size:36;not null" json:"userId"`
	LicenseCode   string     `gorm:"uniqueIndex;size:64;not null" json:"-"`
	LicenseMasked string     `gorm:"size:32;not null" json:"licenseMasked"`
	Category      int        `gorm:"index;not null;default:1" json:"category"`
	Tier          string     `gorm:"size:32;not null;default:'standard'" json:"tier"`
	Status        string     `gorm:"size:20;not null;default:'active'" json:"status"`
	ExpiresAt     *time.Time `json:"expiresAt"`
	LastCheckedAt time.Time  `json:"lastCheckedAt"`
	RemotePayload string     `gorm:"type:text" json:"remotePayload,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

func (UserLicense) TableName() string {
	return "user_licenses"
}

// AutoMigrate 确保 license 数据表初始化就绪
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&UserLicense{})
}

// MaskLicenseCode 对激活码进行商业级脱敏展示（如 OPC-****-8888）
func MaskLicenseCode(code string) string {
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return ""
	}
	length := len(trimmed)
	if length <= 8 {
		return strings.Repeat("*", length)
	}
	prefixLen := 4
	suffixLen := 4
	if length < 10 {
		prefixLen = 2
		suffixLen = 2
	}
	return trimmed[:prefixLen] + strings.Repeat("*", length-prefixLen-suffixLen) + trimmed[length-suffixLen:]
}
