package app

import (
	"encoding/json"
	"errors"
	"strings"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/gorm"
)

// @opc-adapter: feature-credits [start]
const FeatureCreditSettingKey = "feature_credit_settings"

type FeatureCreditItem struct {
	Scene             string `json:"scene"`
	Enabled           bool   `json:"enabled"`
	Mode              string `json:"mode"`              // "fixed" or "model_price"
	FixedMicrocredits int64  `json:"fixedMicrocredits"` // 每次执行固定微积分 (1 积分 = 1,000,000 microcredits)
	DefaultModel      string `json:"defaultModel"`
}

type FeatureCreditSettings struct {
	Features map[string]FeatureCreditItem `json:"features"`
}

var DefaultFeatureScenes = []string{
	"image_workbench",
	"video_workbench",
	"directing_assistant",
	"material_analysis",
	"config_script",
	"video_reverse",
	"ref_script",
}

func defaultFeatureCreditSettings() FeatureCreditSettings {
	features := make(map[string]FeatureCreditItem, len(DefaultFeatureScenes))
	for _, scene := range DefaultFeatureScenes {
		features[scene] = FeatureCreditItem{
			Scene:             scene,
			Enabled:           false,
			Mode:              "fixed",
			FixedMicrocredits: 0,
			DefaultModel:      "",
		}
	}
	return FeatureCreditSettings{Features: features}
}

func (s *Service) featureCreditSettings() (FeatureCreditSettings, error) {
	setting, err := s.repo.SystemSetting(FeatureCreditSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return defaultFeatureCreditSettings(), nil
	}
	if err != nil {
		return FeatureCreditSettings{}, err
	}
	var settings FeatureCreditSettings
	if err := json.Unmarshal([]byte(setting.ValueJSON), &settings); err != nil {
		return FeatureCreditSettings{}, errors.New("功能积分配置格式无效")
	}
	if settings.Features == nil {
		settings.Features = make(map[string]FeatureCreditItem)
	}
	defaults := defaultFeatureCreditSettings()
	for k, v := range defaults.Features {
		if _, exists := settings.Features[k]; !exists {
			settings.Features[k] = v
		}
	}
	return settings, nil
}

func (s *Service) PublicFeatureCreditSettings() (FeatureCreditSettings, error) {
	return s.featureCreditSettings()
}

func (s *Service) AdminFeatureCreditSettings(actor *model.User) (FeatureCreditSettings, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return FeatureCreditSettings{}, err
	}
	return s.featureCreditSettings()
}

func (s *Service) UpdateFeatureCreditSettings(actor *model.User, settings FeatureCreditSettings) (FeatureCreditSettings, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return FeatureCreditSettings{}, err
	}
	if settings.Features == nil {
		settings.Features = make(map[string]FeatureCreditItem)
	}
	for scene, item := range settings.Features {
		if strings.TrimSpace(scene) == "" {
			return FeatureCreditSettings{}, BadAuthRequest("功能板块标识不能为空")
		}
		if item.FixedMicrocredits < 0 || item.FixedMicrocredits > 100_000_000*CreditScale {
			return FeatureCreditSettings{}, BadAuthRequest("积分消耗超出允许范围")
		}
		if item.Mode != "fixed" && item.Mode != "model_price" {
			item.Mode = "fixed"
		}
		item.Scene = scene
		settings.Features[scene] = item
	}

	encoded, err := json.Marshal(settings)
	if err != nil {
		return FeatureCreditSettings{}, err
	}
	setting := model.SystemSetting{
		Key:       FeatureCreditSettingKey,
		ValueJSON: string(encoded),
		UpdatedBy: actor.ID,
	}
	current, err := s.repo.SystemSetting(FeatureCreditSettingKey)
	if err == nil {
		setting.CreatedAt = current.CreatedAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return FeatureCreditSettings{}, err
	}
	if err := s.repo.SaveSystemSetting(&setting); err != nil {
		return FeatureCreditSettings{}, err
	}
	if err := s.appendAdminAudit(actor, "feature_credits.update", "system_setting", FeatureCreditSettingKey, "更新功能积分配置", settings); err != nil {
		return FeatureCreditSettings{}, err
	}
	return settings, nil
}

type DeductFeatureCreditsRequest struct {
	Scene              string  `json:"scene"`
	Model              string  `json:"model"`
	AmountMicrocredits int64   `json:"amountMicrocredits,omitempty"`
	Note               string  `json:"note"`
	ReferenceKey       *string `json:"referenceKey"`
}

type DeductFeatureCreditsResponse struct {
	Account              *model.CreditAccount `json:"account,omitempty"`
	DeductedMicrocredits int64                `json:"deductedMicrocredits"`
	Charged              bool                 `json:"charged"`
}

func (s *Service) DeductFeatureCredits(user *model.User, req DeductFeatureCreditsRequest) (*DeductFeatureCreditsResponse, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	enabled, err := s.FeatureEnabled(FeatureCredits)
	if err != nil || !enabled {
		return &DeductFeatureCreditsResponse{Charged: false, DeductedMicrocredits: 0}, nil
	}
	settings, err := s.featureCreditSettings()
	if err != nil {
		return nil, err
	}
	item, ok := settings.Features[req.Scene]
	if !ok || !item.Enabled {
		return &DeductFeatureCreditsResponse{Charged: false, DeductedMicrocredits: 0}, nil
	}

	amount := item.FixedMicrocredits
	if item.Mode == "model_price" {
		// 服务端权威定价：优先查阅服务端模型定价策略，拒绝客户端随意篡改传入的低额或 0 元
		if pricing, err := s.repo.ModelPricing("", req.Model, ""); err == nil && pricing != nil {
			if pricing.PerMediaMicros > 0 {
				amount = pricing.PerMediaMicros
			} else if pricing.PerRequestMicros > 0 {
				amount = pricing.PerRequestMicros
			}
		}
		if amount <= 0 && item.FixedMicrocredits > 0 {
			amount = item.FixedMicrocredits
		}
		// 若后台未配置且固定为 0，保底 1 积分，杜绝免授权白嫖
		if amount <= 0 {
			amount = 1_000_000
		}
	}

	if amount <= 0 {
		return &DeductFeatureCreditsResponse{Charged: false, DeductedMicrocredits: 0}, nil
	}

	note := req.Note
	if note == "" {
		note = "功能使用扣费: " + req.Scene
	}

	account, _, err := s.repo.DeductFeatureCredits(user.ID, amount, req.Scene, req.Model, note, req.ReferenceKey)
	if err != nil {
		if errors.Is(err, repository.ErrInsufficientCredits) {
			return nil, errors.New("积分余额不足，请先充值或签到领取积分")
		}
		return nil, err
	}

	return &DeductFeatureCreditsResponse{
		Account:              account,
		DeductedMicrocredits: amount,
		Charged:              true,
	}, nil
}

type RefundFeatureCreditsRequest struct {
	AmountMicrocredits   int64   `json:"amountMicrocredits"`
	Scene                string  `json:"scene"`
	Model                string  `json:"model"`
	Note                 string  `json:"note"`
	ReferenceKey         *string `json:"referenceKey"`
	OriginalReferenceKey *string `json:"originalReferenceKey,omitempty"`
	OriginalDeductionID  *string `json:"originalDeductionId,omitempty"`
}

func (s *Service) RefundFeatureCredits(user *model.User, req RefundFeatureCreditsRequest) (*model.CreditAccount, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	note := req.Note
	if note == "" {
		note = "功能执行失败退款: " + req.Scene
	}
	account, _, err := s.repo.RefundFeatureCredits(
		user.ID,
		req.AmountMicrocredits,
		req.Scene,
		req.Model,
		note,
		req.ReferenceKey,
		req.OriginalReferenceKey,
		req.OriginalDeductionID,
	)
	if err != nil {
		if errors.Is(err, repository.ErrOriginalDeductionNotFound) {
			return nil, BadAuthRequest("未找到匹配的原始扣费记录，无法执行退款")
		}
		if errors.Is(err, repository.ErrAlreadyFullyRefunded) {
			return nil, BadAuthRequest("该扣费单据已全额退款，拒绝重复退款")
		}
		if errors.Is(err, repository.ErrRefundExceedsDeduction) {
			return nil, BadAuthRequest("退款金额超出原始扣费可退余额")
		}
		return nil, err
	}
	return account, nil
}
// @opc-adapter: feature-credits [end]
