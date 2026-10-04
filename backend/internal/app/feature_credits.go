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

type FeatureSceneMeta struct {
	Scene                  string    `json:"scene"`
	Title                  string    `json:"title"`
	Description            string    `json:"description"`
	Category               string    `json:"category"` // "video_workbench", "creation_assistant", "image_workbench", "voice", "canvas"
	Capability             string    `json:"capability"` // "text", "image", "video"
	RecommendedMultipliers []float64 `json:"recommendedMultipliers,omitempty"`
}

type FeatureCreditItem struct {
	Scene                 string `json:"scene"`
	Enabled               bool   `json:"enabled"`
	Mode                  string `json:"mode"`                  // "fixed", "model_price", or "token_multiplier"
	FixedMicrocredits     int64  `json:"fixedMicrocredits"`     // 每次执行固定微积分 (1 积分 = 1,000,000 microcredits)
	MultiplierBasisPoints int64  `json:"multiplierBasisPoints"` // 场景基准倍率 (10,000 = 1.0x)
	DefaultModel          string `json:"defaultModel"`
}

type FeatureCreditSettings struct {
	Features              map[string]FeatureCreditItem `json:"features"`
	ModelSceneMultipliers map[string]map[string]int64  `json:"modelSceneMultipliers,omitempty"` // modelKey -> scene -> BPS
	SceneCatalog          []FeatureSceneMeta           `json:"sceneCatalog,omitempty"`          // 权威场景元数据下发
}

var SystemFeatureSceneCatalog = []FeatureSceneMeta{
	{
		Scene:                  "video_director",
		Title:                  "生视频工作台 · 编导分镜生成",
		Description:            "工作流卡片（口播/带货/到店/剧情等）内置编导助手时间线分镜与思考链生成",
		Category:               "video_workbench",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "video_replication",
		Title:                  "生视频工作台 · 深度复刻推演",
		Description:            "参考视频端侧抽帧拼图与用户素材因果演进推演，生成 Seedance-2.0 专用提示词",
		Category:               "video_workbench",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.5, 2.0, 2.5},
	},
	{
		Scene:                  "directing_assistant",
		Title:                  "创造助手 · 全案原创分镜脚本",
		Description:            "编导中枢多模态素材批次分析与原创短剧分镜脚本生成",
		Category:               "creation_assistant",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "material_analysis",
		Title:                  "创造助手 · 素材多模态洞察分析",
		Description:            "多模态图像/视频/音频特征拆解与核心洞察分析",
		Category:               "creation_assistant",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "video_reverse",
		Title:                  "参考视频抽帧反推算子",
		Description:            "逐秒密集抽帧与多模态反推镜头结构与提示词",
		Category:               "creation_assistant",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "image_prompt_optimize",
		Title:                  "生图工作台 · 技能提示词优化",
		Description:            "生图工作流技能卡片规范与素材插槽智能润色融合",
		Category:               "image_workbench",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "voice_script_rewrite",
		Title:                  "台词配音表 · 分镜台词口语化改写",
		Description:            "分镜原文台词口语化节奏改写与 ±2 字严格字数约束",
		Category:               "voice",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "config_script",
		Title:                  "画布节点 · 配置生成脚本",
		Description:            "按平台规格、风格与时长规则自动分段生成脚本",
		Category:               "canvas",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "ref_script",
		Title:                  "画布节点 · 参考生脚本",
		Description:            "结合参考反推与自定义配置生成时间线分镜脚本",
		Category:               "canvas",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:       "image_workbench",
		Title:       "生图工作台 · 图像生成",
		Description: "独立生图工作台的批次与单图渲染生成",
		Category:    "image_workbench",
		Capability:  "image",
	},
	{
		Scene:       "video_workbench",
		Title:       "生视频工作台 · 视频生成",
		Description: "独立生视频工作台的分段生成与成片导出",
		Category:    "video_workbench",
		Capability:  "video",
	},
}

var DefaultFeatureScenes = []string{
	"video_director",
	"video_replication",
	"directing_assistant",
	"material_analysis",
	"video_reverse",
	"image_prompt_optimize",
	"voice_script_rewrite",
	"config_script",
	"ref_script",
	"image_workbench",
	"video_workbench",
}

func defaultFeatureCreditSettings() FeatureCreditSettings {
	features := make(map[string]FeatureCreditItem, len(SystemFeatureSceneCatalog))
	for _, meta := range SystemFeatureSceneCatalog {
		mode := "fixed"
		enabled := false
		if meta.Capability == "text" {
			mode = "token_multiplier"
			enabled = true
		}
		features[meta.Scene] = FeatureCreditItem{
			Scene:                 meta.Scene,
			Enabled:               enabled,
			Mode:                  mode,
			FixedMicrocredits:     0,
			MultiplierBasisPoints: 10_000,
			DefaultModel:          "",
		}
	}
	return FeatureCreditSettings{
		Features:              features,
		ModelSceneMultipliers: make(map[string]map[string]int64),
		SceneCatalog:          SystemFeatureSceneCatalog,
	}
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
	if settings.ModelSceneMultipliers == nil {
		settings.ModelSceneMultipliers = make(map[string]map[string]int64)
	}
	defaults := defaultFeatureCreditSettings()
	for k, v := range defaults.Features {
		if currentItem, exists := settings.Features[k]; !exists {
			settings.Features[k] = v
		} else {
			if currentItem.MultiplierBasisPoints <= 0 {
				currentItem.MultiplierBasisPoints = 10_000
			}
			if currentItem.Mode == "" {
				currentItem.Mode = v.Mode
			}
			settings.Features[k] = currentItem
		}
	}
	settings.SceneCatalog = SystemFeatureSceneCatalog
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
		if item.MultiplierBasisPoints < 0 || item.MultiplierBasisPoints > 1_000_000 {
			return FeatureCreditSettings{}, BadAuthRequest("倍率设置超出允许范围")
		}
		if item.MultiplierBasisPoints == 0 {
			item.MultiplierBasisPoints = 10_000
		}
		if item.Mode != "fixed" && item.Mode != "model_price" && item.Mode != "token_multiplier" {
			item.Mode = "fixed"
		}
		item.Scene = scene
		settings.Features[scene] = item
	}

	if settings.ModelSceneMultipliers != nil {
		cleanedMultipliers := make(map[string]map[string]int64)
		for modelKey, sceneMap := range settings.ModelSceneMultipliers {
			cleanModel := strings.TrimSpace(modelKey)
			if cleanModel == "" {
				continue
			}
			cleanedSceneMap := make(map[string]int64)
			for scene, bps := range sceneMap {
				cleanScene := strings.TrimSpace(scene)
				if cleanScene == "" {
					continue
				}
				if bps < 0 || bps > 1_000_000 {
					return FeatureCreditSettings{}, BadAuthRequest("模型场景倍率超出允许范围 (0~100倍)")
				}
				if bps > 0 {
					cleanedSceneMap[cleanScene] = bps
				}
			}
			if len(cleanedSceneMap) > 0 {
				cleanedMultipliers[cleanModel] = cleanedSceneMap
			}
		}
		settings.ModelSceneMultipliers = cleanedMultipliers
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
	settings.SceneCatalog = SystemFeatureSceneCatalog
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
	cleanScene := strings.TrimSpace(req.Scene)
	var item FeatureCreditItem
	var ok bool
	if item, ok = settings.Features[cleanScene]; !ok {
		for sKey, fItem := range settings.Features {
			if strings.EqualFold(strings.TrimSpace(sKey), cleanScene) {
				item = fItem
				ok = true
				break
			}
		}
	}
	if !ok || !item.Enabled {
		return &DeductFeatureCreditsResponse{Charged: false, DeductedMicrocredits: 0}, nil
	}

	// 若计费模式为 token_multiplier，实际扣费交由系统代理按真实 Token 消耗与场景倍率结算，免去前置扣费
	if item.Mode == "token_multiplier" {
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

func cleanModelKey(key string) string {
	k := strings.TrimSpace(key)
	k = strings.TrimPrefix(k, "models/")
	return strings.ToLower(k)
}

func (s *Service) ResolveModelSceneMultiplier(modelKey string, scene string) (int64, bool) {
	settings, err := s.featureCreditSettings()
	if err != nil {
		return 0, false
	}
	cleanScene := strings.TrimSpace(scene)
	if cleanScene == "" {
		return 0, false
	}

	var sceneItem *FeatureCreditItem
	if item, ok := settings.Features[cleanScene]; ok {
		sceneItem = &item
	} else {
		for sKey, item := range settings.Features {
			if strings.EqualFold(strings.TrimSpace(sKey), cleanScene) {
				sceneItem = &item
				break
			}
		}
	}

	// 核心防护：若该功能场景未启用计费，或其计费模式不是 token_multiplier，则绝不应用场景倍率附加费
	if sceneItem == nil || !sceneItem.Enabled || sceneItem.Mode != "token_multiplier" {
		return 0, false
	}

	targetModel := cleanModelKey(modelKey)

	// 1. 优先在 ModelSceneMultipliers 查找 (精确匹配或 cleanModelKey 匹配)
	if len(settings.ModelSceneMultipliers) > 0 {
		for mKey, sceneMap := range settings.ModelSceneMultipliers {
			if cleanModelKey(mKey) == targetModel || mKey == modelKey {
				for sKey, bps := range sceneMap {
					if strings.EqualFold(strings.TrimSpace(sKey), cleanScene) && bps > 0 {
						return bps, true
					}
				}
			}
		}
	}

	// 2. 回退到该功能场景自身配置的基准倍率
	if sceneItem.MultiplierBasisPoints > 0 {
		return sceneItem.MultiplierBasisPoints, true
	}

	return 0, false
}
// @opc-adapter: feature-credits [end]
