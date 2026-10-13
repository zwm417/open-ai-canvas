package license

import (
	"context"
	"testing"

	"infinite-canvas/backend/internal/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接内存数据库失败: %v", err)
	}
	if err := db.AutoMigrate(
		&model.User{},
		&model.AuthSession{},
		&model.CreditAccount{},
		&model.CreditLedgerEntry{},
		&UserLicense{},
	); err != nil {
		t.Fatalf("自动迁移测试模型失败: %v", err)
	}
	return db
}

func TestMaskLicenseCode(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"", ""},
		{"123456", "******"},
		{"OPC-1234-5678", "OPC-*****5678"},
		{"auto-example-123456", "auto***********3456"},
	}
	for _, c := range cases {
		got := MaskLicenseCode(c.input)
		if got != c.expected {
			t.Errorf("MaskLicenseCode(%q) = %q, expected %q", c.input, got, c.expected)
		}
	}
}

func TestActivateAndLogin_AutoRegister(t *testing.T) {
	db := setupTestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	// 1. 首次使用开发默认激活码激活登录
	res, err := svc.ActivateAndLogin(ctx, DefaultDevActivationCode, "test-device-1", true)
	if err != nil {
		t.Fatalf("首次激活失败: %v", err)
	}

	if !res.IsNewUser {
		t.Errorf("首次激活应该识别为新用户")
	}
	if res.User.ID == "" {
		t.Errorf("新用户ID不能为空")
	}
	if res.License == nil || res.License.Status != "active" {
		t.Errorf("返回的 License 状态必须为 active")
	}
	if res.Session == "" {
		t.Errorf("签发的 Session 不能为空")
	}

	// 验证微积分账户是否建立且有额度
	var account model.CreditAccount
	if err := db.Where("user_id = ?", res.User.ID).First(&account).Error; err != nil {
		t.Fatalf("微积分账户不存在: %v", err)
	}
	if account.AvailableMicrocredits <= 0 {
		t.Errorf("新激活账户微积分额度应大于0，实际为 %d", account.AvailableMicrocredits)
	}

	firstUserID := res.User.ID

	// 2. 模拟用户换电脑或清理缓存，使用同一个激活码再次登录
	res2, err := svc.ActivateAndLogin(ctx, DefaultDevActivationCode, "test-device-2", true)
	if err != nil {
		t.Fatalf("二次激活登录失败: %v", err)
	}

	if res2.IsNewUser {
		t.Errorf("二次登录不应该再被判定为新用户")
	}
	if res2.User.ID != firstUserID {
		t.Errorf("二次登录应当复用已有账号ID: 期望 %s, 实际 %s", firstUserID, res2.User.ID)
	}

	// 验证多设备会话互斥 (Kick-out)：由于 kickOtherSessions=true，旧会话已被清除，当前只有1个有效会话
	var sessionCount int64
	db.Model(&model.AuthSession{}).Where("user_id = ?", firstUserID).Count(&sessionCount)
	if sessionCount != 1 {
		t.Errorf("启用在线互斥后，该用户会话数应为 1，实际为 %d", sessionCount)
	}
}

func TestBindLicenseToExistingUser(t *testing.T) {
	db := setupTestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	// 创建已存在的老用户
	user := model.User{
		ID:          "existing-user-1",
		Username:    "existing_user",
		DisplayName: "老用户",
		Status:      model.UserStatusActive,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("创建老用户失败: %v", err)
	}

	// 老用户兑换激活码
	lic, err := svc.BindLicenseToExistingUser(ctx, user.ID, DefaultDevActivationCode, "device-old")
	if err != nil {
		t.Fatalf("老用户兑换激活码失败: %v", err)
	}

	if lic.UserID != user.ID {
		t.Errorf("兑换绑定的用户ID应为 %s, 实际为 %s", user.ID, lic.UserID)
	}
	if lic.Status != "active" {
		t.Errorf("兑换后的状态应为 active")
	}

	// 状态查询接口复核
	queried, err := svc.GetUserLicense(user.ID)
	if err != nil || queried == nil {
		t.Fatalf("查询已绑定授权失败: %v", err)
	}
	if queried.ID != lic.ID {
		t.Errorf("查询到的授权ID不匹配")
	}
}
