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
	// 1. 画布智能算子（4 个二开专用节点 + 3 个多维表格节点）
	{
		Scene:                  "canvas_video_reverse",
		Title:                  "画布节点 · 视频反推 (经典/创意)",
		Description:            "画布二开算子：视频逐秒抽帧、镜头拆解与提示词反推（支持经典反推与创意反推双模式）",
		Category:               "canvas",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "canvas_material_analysis",
		Title:                  "画布节点 · 素材多模态分析",
		Description:            "画布二开算子：多模态图像/视频/音频特征拆解与核心洞察分析",
		Category:               "canvas",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "config_script",
		Title:                  "画布节点 · 配置生成脚本",
		Description:            "画布二开算子：按平台规格、风格与时长规则自动分段生成脚本",
		Category:               "canvas",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "ref_script",
		Title:                  "画布节点 · 参考生脚本",
		Description:            "画布二开算子：结合参考反推与自定义配置生成时间线分镜脚本",
		Category:               "canvas",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "voice_script_rewrite",
		Title:                  "画布表格 · 台词配音多维表格",
		Description:            "画布多维表格：分镜原文台词口语化节奏改写与 ±2 字严格字数约束",
		Category:               "canvas_table",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "creative_storyboard_table",
		Title:                  "画布表格 · 创意分镜多维表格",
		Description:            "画布多维表格：基于多镜头脚本与资产插槽的批量分镜推演生成",
		Category:               "canvas_table",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "creative_asset_table",
		Title:                  "画布表格 · 创意资产多维表格",
		Description:            "画布多维表格：角色四视图/道具资产批量锚定与提示词生成",
		Category:               "canvas_table",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},

	// 2. 生视频工作台 · 创作助手（功能入口）
	{
		Scene:                  "assistant_material_analysis",
		Title:                  "生视频工作台 · 创作助手 · 素材分析",
		Description:            "创作助手功能入口：多模态图像/视频/音频特征拆解与核心洞察分析",
		Category:               "creation_assistant",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "assistant_video_reverse",
		Title:                  "生视频工作台 · 创作助手 · 视频反推 (经典/创意)",
		Description:            "创作助手功能入口：参考视频经典反推与创意反推抽帧拆解",
		Category:               "creation_assistant",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	{
		Scene:                  "directing_assistant",
		Title:                  "生视频工作台 · 创作助手 · 生成脚本",
		Description:            "创作助手功能入口：结合素材洞察与参考反推生成全案短剧分镜脚本",
		Category:               "creation_assistant",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},

	// 3. 生视频工作台 · 原生功能
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
		Scene:       "video_workbench",
		Title:       "生视频工作台 · 视频生成",
		Description: "独立生视频工作台的分段生成与成片导出",
		Category:    "video_workbench",
		Capability:  "video",
	},

	// 4. 生图工作台
	{
		Scene:                  "image_prompt_optimize",
		Title:                  "生图工作台 · 技能提示词优化",
		Description:            "生图工作流技能卡片规范与素材插槽智能润色融合",
		Category:               "image_workbench",
		Capability:             "text",
		RecommendedMultipliers: []float64{1.0, 1.2, 1.5, 2.0},
	},
	// sub-feature: detail_set_workflow
	{
		Scene:                  "detail_set_plan",
		Title:                  "生图工作台 · 电商套图 AI 规划",
		Description:            "电商套图工作流卡片：商品图卖点分析与 12 模块逐行提示词规划（token 计量）",
		Category:               "image_workbench",
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
}

var DefaultFeatureScenes = []string{
	"canvas_video_reverse",
	"canvas_material_analysis",
	"config_script",
	"ref_script",
	"voice_script_rewrite",
	"creative_storyboard_table",
	"creative_asset_table",
	"assistant_material_analysis",
	"assistant_video_reverse",
	"directing_assistant",
	"video_director",
	"video_replication",
	"video_workbench",
	"image_prompt_optimize",
	// sub-feature: detail_set_workflow
	"detail_set_plan",
	"image_workbench",
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

	// 针对历史旧版 scene 键进行平滑自动迁移
	if oldReverse, exists := settings.Features["video_reverse"]; exists {
		if _, hasCanvas := settings.Features["canvas_video_reverse"]; !hasCanvas {
			item := oldReverse
			item.Scene = "canvas_video_reverse"
			settings.Features["canvas_video_reverse"] = item
		}
		if _, hasAssistant := settings.Features["assistant_video_reverse"]; !hasAssistant {
			item := oldReverse
			item.Scene = "assistant_video_reverse"
			settings.Features["assistant_video_reverse"] = item
		}
	}
	if oldMat, exists := settings.Features["material_analysis"]; exists {
		if _, hasCanvas := settings.Features["canvas_material_analysis"]; !hasCanvas {
			item := oldMat
			item.Scene = "canvas_material_analysis"
			settings.Features["canvas_material_analysis"] = item
		}
		if _, hasAssistant := settings.Features["assistant_material_analysis"]; !hasAssistant {
			item := oldMat
			item.Scene = "assistant_material_analysis"
			settings.Features["assistant_material_analysis"] = item
		}
	}
	for _, sceneMap := range settings.ModelSceneMultipliers {
		if revBps, ok := sceneMap["video_reverse"]; ok && revBps > 0 {
			if _, has := sceneMap["canvas_video_reverse"]; !has {
				sceneMap["canvas_video_reverse"] = revBps
			}
			if _, has := sceneMap["assistant_video_reverse"]; !has {
				sceneMap["assistant_video_reverse"] = revBps
			}
		}
		if matBps, ok := sceneMap["material_analysis"]; ok && matBps > 0 {
			if _, has := sceneMap["canvas_material_analysis"]; !has {
				sceneMap["canvas_material_analysis"] = matBps
			}
			if _, has := sceneMap["assistant_material_analysis"]; !has {
				sceneMap["assistant_material_analysis"] = matBps
			}
		}
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

func getSceneAliases(scene string) []string {
	s := strings.TrimSpace(scene)
	switch s {
	case "video_reverse":
		return []string{"canvas_video_reverse", "assistant_video_reverse", "video_reverse"}
	case "canvas_video_reverse":
		return []string{"canvas_video_reverse", "video_reverse", "assistant_video_reverse"}
	case "assistant_video_reverse":
		return []string{"assistant_video_reverse", "video_reverse", "canvas_video_reverse"}
	case "material_analysis":
		return []string{"canvas_material_analysis", "assistant_material_analysis", "material_analysis"}
	case "canvas_material_analysis":
		return []string{"canvas_material_analysis", "material_analysis", "assistant_material_analysis"}
	case "assistant_material_analysis":
		return []string{"assistant_material_analysis", "material_analysis", "canvas_material_analysis"}
	case "config_script", "canvas_script_generator", "canvas_config_script":
		return []string{"config_script", "canvas_script_generator", "canvas_config_script"}
	case "ref_script", "canvas_reference_script", "canvas_ref_script":
		return []string{"ref_script", "canvas_reference_script", "canvas_ref_script"}
	case "voice_script_rewrite", "creative_voice_table", "canvas_table_voice":
		return []string{"voice_script_rewrite", "creative_voice_table", "canvas_table_voice"}
	case "creative_storyboard_table", "canvas_table_storyboard", "storyboard_table":
		return []string{"creative_storyboard_table", "canvas_table_storyboard", "storyboard_table"}
	case "creative_asset_table", "canvas_table_asset", "asset_table":
		return []string{"creative_asset_table", "canvas_table_asset", "asset_table"}
	case "directing_assistant", "assistant_generate_script", "assistant_script":
		return []string{"directing_assistant", "assistant_generate_script", "assistant_script"}
	case "video_director", "workflow_storyboard":
		return []string{"video_director", "workflow_storyboard"}
	case "video_replication", "deep_replication":
		return []string{"video_replication", "deep_replication"}
	case "image_prompt_optimize", "prompt_optimizer":
		return []string{"image_prompt_optimize", "prompt_optimizer"}
	default:
		return []string{s}
	}
}

func findFeatureItem(features map[string]FeatureCreditItem, scene string) (FeatureCreditItem, bool) {
	cleanScene := strings.TrimSpace(scene)
	if cleanScene == "" {
		return FeatureCreditItem{}, false
	}
	aliases := getSceneAliases(cleanScene)
	for _, alias := range aliases {
		if item, ok := features[alias]; ok {
			return item, true
		}
	}
	lower := strings.ToLower(cleanScene)
	for k, item := range features {
		if strings.ToLower(strings.TrimSpace(k)) == lower {
			return item, true
		}
	}
	return FeatureCreditItem{}, false
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
	item, ok := findFeatureItem(settings.Features, cleanScene)

	// 若后台显式配置了该场景，且管理员明确将其停用（Enabled: false），则视为管理员主动免费放行
	if ok && !item.Enabled {
		return &DeductFeatureCreditsResponse{Charged: false, DeductedMicrocredits: 0}, nil
	}

	// 若计费模式为 token_multiplier，实际扣费交由系统反向代理网关按真实 Token 消耗与场景倍率结算，免去前置扣费
	if ok && item.Mode == "token_multiplier" {
		return &DeductFeatureCreditsResponse{Charged: false, DeductedMicrocredits: 0}, nil
	}

	amount := int64(0)
	if ok && item.Mode == "fixed" {
		amount = item.FixedMicrocredits
	}

	// 若设置为 model_price，或者该场景未在功能列表单独配置（未配置保底扣费机制），按系统权威模型定价或保底点数扣除
	if !ok || item.Mode == "model_price" {
		if pricing, err := s.repo.ModelPricing("", req.Model, ""); err == nil && pricing != nil {
			if pricing.PerMediaMicros > 0 {
				amount = pricing.PerMediaMicros
			} else if pricing.PerRequestMicros > 0 {
				amount = pricing.PerRequestMicros
			}
		}
		if amount <= 0 && ok && item.FixedMicrocredits > 0 {
			amount = item.FixedMicrocredits
		}
		// 原系统保底机制：若未单独配置功能且模型未定价，强制保底 1 积分 (1,000,000 微积分)，杜绝因未配置而产生免扣白嫖漏洞
		if amount <= 0 {
			amount = 1_000_000
		}
	}

	// 若管理员显式设置固定积分为 0，放行免费
	if ok && item.Mode == "fixed" && item.FixedMicrocredits == 0 {
		return &DeductFeatureCreditsResponse{Charged: false, DeductedMicrocredits: 0}, nil
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

	item, ok := findFeatureItem(settings.Features, cleanScene)

	// 核心防护：若显式配置且禁用，或者计费模式非 token_multiplier，绝不附加场景倍率
	if ok {
		if !item.Enabled || item.Mode != "token_multiplier" {
			return 0, false
		}
	}

	targetModel := cleanModelKey(modelKey)
	aliases := getSceneAliases(cleanScene)

	// 1. 优先在 ModelSceneMultipliers 查找 (支持模型键与场景别名匹配)
	if len(settings.ModelSceneMultipliers) > 0 {
		for mKey, sceneMap := range settings.ModelSceneMultipliers {
			if cleanModelKey(mKey) == targetModel || mKey == modelKey {
				for _, alias := range aliases {
					for sKey, bps := range sceneMap {
						if strings.EqualFold(strings.TrimSpace(sKey), alias) && bps > 0 {
							return bps, true
						}
					}
				}
			}
		}
	}

	// 2. 回退到该功能场景自身配置的基准倍率
	if ok && item.MultiplierBasisPoints > 0 {
		return item.MultiplierBasisPoints, true
	}

	return 0, false
}
// @opc-adapter: feature-credits [end]
