package repository

import (
	"testing"

	"infinite-canvas/backend/internal/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newFeatureCreditsRepository(t *testing.T) (*Repository, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+newRepositoryID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	return &Repository{db: db}, db
}

func TestDeductFeatureCreditsIdempotency(t *testing.T) {
	repo, db := newFeatureCreditsRepository(t)
	userID := "user-feature-test-1"

	if err := db.Create(&model.CreditAccount{
		UserID:                userID,
		AvailableMicrocredits: 10_000_000,
	}).Error; err != nil {
		t.Fatal(err)
	}

	refKey := "deduct:test_scene:node-1:exec-1"

	// 第一次扣费 3,000,000 microcredits
	acc1, entry1, err := repo.DeductFeatureCredits(userID, 3_000_000, "test_scene", "model-a", "首次扣费", &refKey)
	if err != nil {
		t.Fatalf("first deduct failed: %v", err)
	}
	if acc1.AvailableMicrocredits != 7_000_000 {
		t.Fatalf("expected available 7_000_000, got %d", acc1.AvailableMicrocredits)
	}
	if entry1.AmountMicrocredits != -3_000_000 {
		t.Fatalf("expected entry amount -3_000_000, got %d", entry1.AmountMicrocredits)
	}

	// 模拟并发或重试：使用相同的 referenceKey 再次发起扣费
	acc2, entry2, err := repo.DeductFeatureCredits(userID, 3_000_000, "test_scene", "model-a", "重试扣费", &refKey)
	if err != nil {
		t.Fatalf("second deduct failed: %v", err)
	}
	// 余额必须保持 7_000_000，绝对不能被二次扣减！
	if acc2.AvailableMicrocredits != 7_000_000 {
		t.Fatalf("expected available 7_000_000 on idempotency hit, got %d", acc2.AvailableMicrocredits)
	}
	if entry2.ID != entry1.ID {
		t.Fatalf("expected same ledger entry ID on idempotency hit, got %s vs %s", entry2.ID, entry1.ID)
	}

	// 确认数据库流水中仅有 1 条扣费单据
	var count int64
	if err := db.Model(&model.CreditLedgerEntry{}).Where("reference_key = ?", refKey).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 ledger entry, got %d", count)
	}
}

func TestRefundFeatureCreditsIdempotencyAndAntiMinting(t *testing.T) {
	repo, db := newFeatureCreditsRepository(t)
	userID := "user-feature-test-2"

	if err := db.Create(&model.CreditAccount{
		UserID:                userID,
		AvailableMicrocredits: 5_000_000,
	}).Error; err != nil {
		t.Fatal(err)
	}

	deductKey := "deduct:test_scene:node-2:exec-1"
	refundKey := "refund:test_scene:node-2:exec-1"

	// 0. 防御测试：未产生过扣费前直接发起退款，必须被坚决拦截（杜绝无限铸币）
	_, _, fakeErr := repo.RefundFeatureCredits(userID, 2_000_000, "test_scene", "model-a", "凭空恶意退款", &refundKey, nil, nil)
	if fakeErr == nil || fakeErr != ErrOriginalDeductionNotFound {
		t.Fatalf("expected ErrOriginalDeductionNotFound on fake refund, got: %v", fakeErr)
	}

	// 1. 产生合法扣费 2,000,000 microcredits，账户余额变为 3,000,000
	_, _, err := repo.DeductFeatureCredits(userID, 2_000_000, "test_scene", "model-a", "原始扣费", &deductKey)
	if err != nil {
		t.Fatalf("deduct failed: %v", err)
	}

	// 2. 第一次正常退款 2,000,000 microcredits，自动关联到扣费单据
	acc1, entry1, err := repo.RefundFeatureCredits(userID, 2_000_000, "test_scene", "model-a", "首次退款", &refundKey, nil, nil)
	if err != nil {
		t.Fatalf("first refund failed: %v", err)
	}
	if acc1.AvailableMicrocredits != 5_000_000 {
		t.Fatalf("expected available 5_000_000, got %d", acc1.AvailableMicrocredits)
	}
	if entry1.AmountMicrocredits != 2_000_000 {
		t.Fatalf("expected entry amount 2_000_000, got %d", entry1.AmountMicrocredits)
	}

	// 3. 模拟并发或重试：使用相同的 referenceKey 再次发起退款（命中幂等性，不重复加钱）
	acc2, entry2, err := repo.RefundFeatureCredits(userID, 2_000_000, "test_scene", "model-a", "重试退款", &refundKey, nil, nil)
	if err != nil {
		t.Fatalf("second refund failed: %v", err)
	}
	if acc2.AvailableMicrocredits != 5_000_000 {
		t.Fatalf("expected available 5_000_000 on refund idempotency hit, got %d", acc2.AvailableMicrocredits)
	}
	if entry2.ID != entry1.ID {
		t.Fatalf("expected same ledger entry ID on refund idempotency hit, got %s vs %s", entry2.ID, entry1.ID)
	}

	// 4. 防御测试：生成新的 referenceKey 企图对同一笔扣款重复退款，必须被拒绝（杜绝刷钱）
	newRefundKey := "refund:test_scene:node-2:exec-1-hack"
	_, _, dupErr := repo.RefundFeatureCredits(userID, 2_000_000, "test_scene", "model-a", "企图二次套现退款", &newRefundKey, &deductKey, nil)
	if dupErr == nil || dupErr != ErrAlreadyFullyRefunded {
		t.Fatalf("expected ErrAlreadyFullyRefunded on repeated refund attempt, got: %v", dupErr)
	}

	// 5. 防御测试：退款金额超出原始扣费剩余额度（例如扣 1,000,000 企图退 2,000,000）
	deductKey3 := "deduct:test_scene:node-3:exec-1"
	refundKey3 := "refund:test_scene:node-3:exec-1"
	if _, _, err := repo.DeductFeatureCredits(userID, 1_000_000, "test_scene", "model-a", "扣款1", &deductKey3); err != nil {
		t.Fatal(err)
	}
	_, _, exceedErr := repo.RefundFeatureCredits(userID, 2_000_000, "test_scene", "model-a", "超额退款", &refundKey3, &deductKey3, nil)
	if exceedErr == nil || exceedErr != ErrRefundExceedsDeduction {
		t.Fatalf("expected ErrRefundExceedsDeduction on over-refund, got: %v", exceedErr)
	}

	// 6. 防御测试：跨租户安全隔离 - 用户 B 试图使用用户 A 的 referenceKey 发起扣款或退款，必须拒绝
	userB := "user-feature-test-other"
	if err := db.Create(&model.CreditAccount{UserID: userB, AvailableMicrocredits: 5_000_000}).Error; err != nil {
		t.Fatal(err)
	}
	_, _, crossDeductErr := repo.DeductFeatureCredits(userB, 1_000_000, "test_scene", "model-a", "跨租户扣款", &deductKey3)
	if crossDeductErr == nil {
		t.Fatalf("expected cross tenant deduct error, got nil")
	}
	_, _, crossRefundErr := repo.RefundFeatureCredits(userB, 1_000_000, "test_scene", "model-a", "跨租户退款", &refundKey, nil, nil)
	if crossRefundErr == nil {
		t.Fatalf("expected cross tenant refund error, got nil")
	}

	// 确认数据库流水中仅有合法的流水单据
	var count int64
	if err := db.Model(&model.CreditLedgerEntry{}).Where("user_id = ? AND type = ?", userID, model.CreditLedgerRefund).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 refund ledger entry, got %d", count)
	}
}
