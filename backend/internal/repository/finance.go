package repository

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/model"
)

var (
	ErrInsufficientCredits       = errors.New("积分不足，请先充值")
	ErrRedeemCodeInvalid         = errors.New("兑换码无效或已使用")
	ErrActiveTaskLimit           = errors.New("同时进行的任务数已达上限，请等待已有任务完成")
	ErrTaskNotRetryable          = errors.New("该任务当前状态不支持重试")
	ErrBillingStateConflict      = errors.New("计费状态已变化，请刷新后重试")
	ErrBillingUsageUnavailable   = errors.New("暂时无法获取用量，计费未完成")
	ErrBillingChargeLimit        = errors.New("本次费用超过授权上限，已拒绝扣费")
	ErrChannelModelInUse         = errors.New("该渠道模型正在被使用，无法删除或停用")
	ErrOriginalDeductionNotFound = errors.New("未找到匹配的原始扣费记录，无法执行退款")
	ErrAlreadyFullyRefunded       = errors.New("该扣费单据已全额退款，拒绝重复退款")
	ErrRefundExceedsDeduction     = errors.New("退款金额超出原始扣费金额")
)

// 先抢占唯一业务键再更新账户，确保注册和签到奖励在多实例并发下只入账一次。
func (r *Repository) GrantCreditsOnce(userID string, entryType model.CreditLedgerType, amount int64, referenceKey string, note string) (*model.CreditAccount, bool, error) {
	var account model.CreditAccount
	granted := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		account = model.CreditAccount{UserID: userID}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
			return err
		}
		entry := model.CreditLedgerEntry{ID: newRepositoryID(), UserID: userID, Type: entryType, AmountMicrocredits: amount, ReferenceKey: &referenceKey, Note: note}
		created := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "reference_key"}}, DoNothing: true}).Create(&entry)
		if created.Error != nil {
			return created.Error
		}
		if created.RowsAffected == 0 {
			return tx.First(&account, "user_id = ?", userID).Error
		}
		granted = true
		if err := tx.Model(&model.CreditAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits + ?", amount),
			"version":                gorm.Expr("version + 1"),
			"updated_at":             time.Now(),
		}).Error; err != nil {
			return err
		}
		if err := tx.First(&account, "user_id = ?", userID).Error; err != nil {
			return err
		}
		return tx.Model(&entry).Updates(map[string]any{
			"available_delta_microcredits": amount,
			"available_after_microcredits": account.AvailableMicrocredits,
			"reserved_after_microcredits":  account.ReservedMicrocredits,
		}).Error
	})
	return &account, granted, err
}

func (r *Repository) CreditAccount(userID string) (*model.CreditAccount, error) {
	account := model.CreditAccount{UserID: userID}
	if err := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
		return nil, err
	}
	if err := r.db.First(&account, "user_id = ?", userID).Error; err != nil {
		return nil, err
	}
	return &account, nil
}

func (r *Repository) CreditAccounts(userIDs []string) ([]model.CreditAccount, error) {
	if len(userIDs) == 0 {
		return []model.CreditAccount{}, nil
	}
	var accounts []model.CreditAccount
	err := r.db.Where("user_id IN ?", userIDs).Find(&accounts).Error
	return accounts, err
}

func (r *Repository) CreditLedger(userID string, entryType string, limit int, offset int) ([]model.CreditLedgerEntry, int64, error) {
	var items []model.CreditLedgerEntry
	var total int64
	query := r.db.Model(&model.CreditLedgerEntry{}).Where("user_id = ? AND type <> ?", userID, model.CreditLedgerReserve)
	switch entryType {
	case "income":
		query = query.Where("type IN ?", []model.CreditLedgerType{model.CreditLedgerRedeem, model.CreditLedgerAdminGrant, model.CreditLedgerAdminAdjust, model.CreditLedgerSignupBonus, model.CreditLedgerCheckinBonus})
	case "consume":
		query = query.Where("type = ?", model.CreditLedgerConsume)
	case "refund":
		query = query.Where("type = ?", model.CreditLedgerRefund)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	err := query.Order("created_at desc").Limit(limit).Offset(offset).Find(&items).Error
	return items, total, err
}

func (r *Repository) CreditLedgerReferenceExists(referenceKey string) (bool, error) {
	var count int64
	err := r.db.Model(&model.CreditLedgerEntry{}).Where("reference_key = ?", referenceKey).Count(&count).Error
	return count > 0, err
}

func (r *Repository) CreateTaskWithCreditReservation(task *model.Task, order *model.BillingOrder, activeTaskLimit int) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := r.requireActiveLogicalModelForTask(tx, task); err != nil {
			return err
		}
		if err := enforceActiveTaskLimit(tx, task.UserID, activeTaskLimit); err != nil {
			return err
		}
		if err := reserveBillingOrder(tx, order); err != nil {
			return err
		}
		return tx.Create(task).Error
	})
}

func (r *Repository) CreateTaskWithActiveLimit(task *model.Task, activeTaskLimit int) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := r.requireActiveLogicalModelForTask(tx, task); err != nil {
			return err
		}
		if err := enforceActiveTaskLimit(tx, task.UserID, activeTaskLimit); err != nil {
			return err
		}
		return tx.Create(task).Error
	})
}

func (r *Repository) RetryTaskWithBilling(userID string, prepared *model.Task, order *model.BillingOrder, activeTaskLimit int) (*model.Task, error) {
	var task model.Task
	taskID := prepared.ID
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := enforceActiveTaskLimit(tx, userID, activeTaskLimit); err != nil {
			return err
		}
		if order != nil {
			if err := reserveBillingOrder(tx, order); err != nil {
				return err
			}
		}
		updates := map[string]any{
			"status": model.TaskStatusQueued, "stage": "等待队列调度", "progress": 5, "error": "", "result_json": "",
			"execution_diagnostic_json": "", "cancellation_source": "", "cancellation_actor_id": "", "cancellation_requested_at": nil,
			"text_draft": "", "started_at": nil, "completed_at": nil,
			"provider_request_id": "", "poll_stage": "", "next_poll_at": nil,
			"provider_cancel_status": "", "provider_cancel_error": "", "provider_cancel_attempts": 0,
			"provider_cancel_requested_at": nil, "provider_cancelled_at": nil, "provider_cancel_next_check_at": nil,
			"route_run":                 gorm.Expr("route_run + ?", 1),
			"logical_model_revision_id": prepared.LogicalModelRevisionID, "route_id": prepared.RouteID,
			"channel_model_id": prepared.ChannelModelID, "input_json": prepared.InputJSON,
			"model": prepared.Model, "provider": prepared.Provider,
			"lease_owner": "", "lease_expires_at": nil, "updated_at": time.Now(),
		}
		if order != nil {
			updates["billing_order_id"] = order.ID
		} else {
			// 免费模式重试必须解除旧订单，避免任务执行阶段复用上一次的计费状态。
			updates["billing_order_id"] = ""
		}
		updated := tx.Model(&model.Task{}).
			Where("id = ? AND user_id = ? AND status IN ?", taskID, userID, []model.TaskStatus{model.TaskStatusFailed, model.TaskStatusCancelled}).
			Updates(updates)
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrTaskNotRetryable
		}
		if err := tx.Delete(&model.TaskTextDelta{}, "user_id = ? AND task_id = ?", userID, taskID).Error; err != nil {
			return err
		}
		return tx.First(&task, "id = ? AND user_id = ?", taskID, userID).Error
	})
	return &task, err
}

func enforceActiveTaskLimit(tx *gorm.DB, userID string, activeTaskLimit int) error {
	var count int64
	if err := tx.Model(&model.Task{}).Where("user_id = ? AND status IN ?", userID, []model.TaskStatus{model.TaskStatusQueued, model.TaskStatusRunning}).Count(&count).Error; err != nil {
		return err
	}
	if count >= int64(activeTaskLimit) {
		return ErrActiveTaskLimit
	}
	return nil
}

func newRepositoryID() string {
	return randomRepositorySuffix()
}

func randomRepositorySuffix() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "fallback"
	}
	return hex.EncodeToString(value[:])
}

// @opc-adapter: feature-credits [start]
func (r *Repository) DeductFeatureCredits(userID string, amount int64, scene string, modelName string, note string, referenceKey *string) (*model.CreditAccount, *model.CreditLedgerEntry, error) {
	var account model.CreditAccount
	var entry model.CreditLedgerEntry
	err := r.db.Transaction(func(tx *gorm.DB) error {
		account = model.CreditAccount{UserID: userID}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
			return err
		}
		if referenceKey != nil && *referenceKey != "" {
			var existing model.CreditLedgerEntry
			if findErr := tx.First(&existing, "reference_key = ?", *referenceKey).Error; findErr == nil {
				if existing.UserID != userID {
					return errors.New("幂等键已被其他租户占用")
				}
				entry = existing
				return tx.First(&account, "user_id = ?", userID).Error
			}
		}
		updated := tx.Model(&model.CreditAccount{}).
			Where("user_id = ? AND available_microcredits >= ?", userID, amount).
			Updates(map[string]any{
				"available_microcredits": gorm.Expr("available_microcredits - ?", amount),
				"version":                gorm.Expr("version + 1"),
				"updated_at":             time.Now(),
			})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrInsufficientCredits
		}
		if err := tx.First(&account, "user_id = ?", userID).Error; err != nil {
			return err
		}
		entryID := newRepositoryID()
		entry = model.CreditLedgerEntry{
			ID:                         entryID,
			UserID:                     userID,
			Type:                       model.CreditLedgerConsume,
			AmountMicrocredits:         -amount,
			AvailableDeltaMicrocredits: -amount,
			AvailableAfterMicrocredits: account.AvailableMicrocredits,
			ReservedAfterMicrocredits:  account.ReservedMicrocredits,
			BillingOrderID:             entryID,
			Model:                      modelName,
			Scene:                      scene,
			Note:                       note,
			ReferenceKey:               referenceKey,
			CreatedAt:                  time.Now(),
		}
		return tx.Create(&entry).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &account, &entry, nil
}

func (r *Repository) RefundFeatureCredits(
	userID string,
	amount int64,
	scene string,
	modelName string,
	note string,
	referenceKey *string,
	originalReferenceKey *string,
	originalDeductionID *string,
) (*model.CreditAccount, *model.CreditLedgerEntry, error) {
	var account model.CreditAccount
	var entry model.CreditLedgerEntry
	err := r.db.Transaction(func(tx *gorm.DB) error {
		account = model.CreditAccount{UserID: userID}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
			return err
		}

		// 1. 退款幂等性检查：若该 refund reference_key 已经入账，幂等返回已有流水，杜绝重复退款
		if referenceKey != nil && *referenceKey != "" {
			var existing model.CreditLedgerEntry
			if findErr := tx.First(&existing, "reference_key = ?", *referenceKey).Error; findErr == nil {
				if existing.UserID != userID {
					return errors.New("幂等键已被其他租户占用")
				}
				entry = existing
				return tx.First(&account, "user_id = ?", userID).Error
			}
		}

		// 2. 溯源定位原始扣款记录 (Original Deduction)
		var originalEntry model.CreditLedgerEntry
		var foundOriginal bool

		if originalDeductionID != nil && *originalDeductionID != "" {
			if err := tx.Where("id = ? AND user_id = ? AND type = ?", *originalDeductionID, userID, model.CreditLedgerConsume).First(&originalEntry).Error; err == nil {
				foundOriginal = true
			}
		}

		if !foundOriginal && originalReferenceKey != nil && *originalReferenceKey != "" {
			if err := tx.Where("reference_key = ? AND user_id = ? AND type = ?", *originalReferenceKey, userID, model.CreditLedgerConsume).First(&originalEntry).Error; err == nil {
				foundOriginal = true
			}
		}

		// 自动推断：若未提供显式 originalReferenceKey，但 referenceKey 遵循 "refund:*" 命名，则推断匹配 "deduct:*"
		if !foundOriginal && referenceKey != nil && *referenceKey != "" && strings.HasPrefix(*referenceKey, "refund:") {
			inferredDeductKey := "deduct:" + strings.TrimPrefix(*referenceKey, "refund:")
			if err := tx.Where("reference_key = ? AND user_id = ? AND type = ?", inferredDeductKey, userID, model.CreditLedgerConsume).First(&originalEntry).Error; err == nil {
				foundOriginal = true
			}
		}

		// 安全防御底线：严禁凭空退款！未找到合法扣款记录一律拒绝
		if !foundOriginal {
			return ErrOriginalDeductionNotFound
		}

		// 3. 场景一致性校验
		if scene != "" && originalEntry.Scene != "" && originalEntry.Scene != scene {
			return errors.New("退款场景与原始扣费场景不匹配")
		}

		// 4. 统计此原始扣款记录已成功退款的累计金额 (以 originalEntry.ID 作为 billing_order_id)
		var alreadyRefunded int64
		if err := tx.Model(&model.CreditLedgerEntry{}).
			Where("user_id = ? AND type = ? AND billing_order_id = ?", userID, model.CreditLedgerRefund, originalEntry.ID).
			Select("COALESCE(SUM(amount_microcredits), 0)").
			Scan(&alreadyRefunded).Error; err != nil {
			return err
		}

		originalDeductedAmount := -originalEntry.AmountMicrocredits
		if originalDeductedAmount <= 0 {
			originalDeductedAmount = originalEntry.AmountMicrocredits
		}

		remainingRefundable := originalDeductedAmount - alreadyRefunded
		if remainingRefundable <= 0 {
			return ErrAlreadyFullyRefunded
		}

		// 5. 确定最终退款金额（上限严格锁死在剩余可退额度内，严禁超退）
		refundAmount := amount
		if refundAmount <= 0 {
			refundAmount = remainingRefundable
		} else if refundAmount > remainingRefundable {
			return ErrRefundExceedsDeduction
		}

		// 6. 原子增加可用积分
		if err := tx.Model(&model.CreditAccount{}).
			Where("user_id = ?", userID).
			Updates(map[string]any{
				"available_microcredits": gorm.Expr("available_microcredits + ?", refundAmount),
				"version":                gorm.Expr("version + 1"),
				"updated_at":             time.Now(),
			}).Error; err != nil {
			return err
		}
		if err := tx.First(&account, "user_id = ?", userID).Error; err != nil {
			return err
		}

		// 7. 写入退款流水并永久绑定 BillingOrderID = originalEntry.ID
		entry = model.CreditLedgerEntry{
			ID:                         newRepositoryID(),
			UserID:                     userID,
			Type:                       model.CreditLedgerRefund,
			AmountMicrocredits:         refundAmount,
			AvailableDeltaMicrocredits: refundAmount,
			AvailableAfterMicrocredits: account.AvailableMicrocredits,
			ReservedAfterMicrocredits:  account.ReservedMicrocredits,
			BillingOrderID:             originalEntry.ID,
			Model:                      modelName,
			Scene:                      scene,
			Note:                       note,
			ReferenceKey:               referenceKey,
			CreatedAt:                  time.Now(),
		}
		return tx.Create(&entry).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &account, &entry, nil
}
// @opc-adapter: feature-credits [end]

