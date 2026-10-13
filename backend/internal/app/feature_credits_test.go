package app

import (
	"testing"

	"infinite-canvas/backend/internal/model"
)

// @opc-adapter: feature-credits [start]
func TestFeatureCreditSettingsModelSceneMultipliers(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.User{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}

	admin := &model.User{ID: "admin_user", Role: model.UserRoleAdmin}

	settings := FeatureCreditSettings{
		Features: map[string]FeatureCreditItem{
			"video_reverse": {
				Scene:                 "video_reverse",
				Enabled:               true,
				Mode:                  "token_multiplier",
				FixedMicrocredits:     0,
				MultiplierBasisPoints: 15_000, // 1.5x 场景默认倍率
			},
			"material_analysis": {
				Scene:                 "material_analysis",
				Enabled:               true,
				Mode:                  "fixed",
				FixedMicrocredits:     2_000_000,
				MultiplierBasisPoints: 10_000,
			},
		},
		ModelSceneMultipliers: map[string]map[string]int64{
			"gemini-2.5-flash": {
				"video_reverse": 20_000, // 2.0x 专属模型场景倍率
			},
		},
	}

	updated, err := svc.UpdateFeatureCreditSettings(admin, settings)
	if err != nil {
		t.Fatalf("UpdateFeatureCreditSettings error: %v", err)
	}

	if updated.Features["video_reverse"].MultiplierBasisPoints != 15_000 {
		t.Fatalf("expected 15000, got %d", updated.Features["video_reverse"].MultiplierBasisPoints)
	}

	if len(updated.SceneCatalog) != len(SystemFeatureSceneCatalog) {
		t.Fatalf("expected %d scenes in SceneCatalog, got %d", len(SystemFeatureSceneCatalog), len(updated.SceneCatalog))
	}
	var foundReplication bool
	for _, meta := range updated.SceneCatalog {
		if meta.Scene == "video_replication" {
			foundReplication = true
			if len(meta.RecommendedMultipliers) != 4 || meta.RecommendedMultipliers[3] != 2.5 {
				t.Fatalf("expected video_replication recommendedMultipliers to contain 2.5, got %v", meta.RecommendedMultipliers)
			}
		}
	}
	if !foundReplication {
		t.Fatalf("expected video_replication in SceneCatalog")
	}

	// 1. 测试特定模型专属场景倍率解析 (包含 models/ 前缀容错)
	bps, ok := svc.ResolveModelSceneMultiplier("gemini-2.5-flash", "video_reverse")
	if !ok || bps != 20_000 {
		t.Fatalf("expected 20000 bps for gemini-2.5-flash in video_reverse, got %d (ok=%v)", bps, ok)
	}

	bpsPrefix, ok := svc.ResolveModelSceneMultiplier("models/gemini-2.5-flash", "video_reverse")
	if !ok || bpsPrefix != 20_000 {
		t.Fatalf("expected 20000 bps for models/gemini-2.5-flash, got %d (ok=%v)", bpsPrefix, ok)
	}

	// 2. 测试未配置专属模型倍率时回退到场景基准倍率 (15,000)
	bpsDefault, ok := svc.ResolveModelSceneMultiplier("deepseek-chat", "video_reverse")
	if !ok || bpsDefault != 15_000 {
		t.Fatalf("expected 15000 bps fallback for video_reverse, got %d (ok=%v)", bpsDefault, ok)
	}

	// 3. 测试未配置场景
	_, okUnconfigured := svc.ResolveModelSceneMultiplier("gemini-2.5-flash", "non_existing_scene")
	if okUnconfigured {
		t.Fatalf("expected false for unconfigured scene")
	}

	// 3.1 测试 fixed 模式场景绝不应用场景倍率附加费 (防止重复收费)
	_, okFixed := svc.ResolveModelSceneMultiplier("gemini-2.5-flash", "material_analysis")
	if okFixed {
		t.Fatalf("expected false for fixed mode scene material_analysis")
	}

	// 3.2 测试禁用计费的场景不应用场景倍率
	settings.Features["video_reverse"] = FeatureCreditItem{
		Scene:                 "video_reverse",
		Enabled:               false, // 禁用计费
		Mode:                  "token_multiplier",
		MultiplierBasisPoints: 15_000,
	}
	if _, err := svc.UpdateFeatureCreditSettings(admin, settings); err != nil {
		t.Fatal(err)
	}
	_, okDisabled := svc.ResolveModelSceneMultiplier("gemini-2.5-flash", "video_reverse")
	if okDisabled {
		t.Fatalf("expected false when scene billing is disabled")
	}

	// 恢复启用以便后续测试
	settings.Features["video_reverse"] = FeatureCreditItem{
		Scene:                 "video_reverse",
		Enabled:               true,
		Mode:                  "token_multiplier",
		MultiplierBasisPoints: 15_000,
	}
	if _, err := svc.UpdateFeatureCreditSettings(admin, settings); err != nil {
		t.Fatal(err)
	}

	// 4. 测试 DeductFeatureCredits 在 token_multiplier 模式下不进行前置扣费
	user := &model.User{ID: "normal_user", Role: model.UserRoleUser}
	deductRes, err := svc.DeductFeatureCredits(user, DeductFeatureCreditsRequest{
		Scene: "video_reverse",
		Model: "gemini-2.5-flash",
	})
	if err != nil {
		t.Fatalf("DeductFeatureCredits error: %v", err)
	}
	if deductRes.Charged || deductRes.DeductedMicrocredits != 0 {
		t.Fatalf("expected no upfront charge for token_multiplier mode, got charged=%v deducted=%d", deductRes.Charged, deductRes.DeductedMicrocredits)
	}

	// 5. 测试 newBillingOrder 会正确应用解析到的场景专属倍率 (20_000)
	channel := model.ModelChannel{ID: "chan_test", Scope: model.ChannelScopeSystem, Name: "测试渠道", Enabled: true, ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	reqModel := ChannelModelRequest{
		ModelKey: "gemini-2.5-flash", DisplayName: "Gemini", ChannelLabel: "渠道A", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
		CapabilityConfig: DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "gemini-2.5-flash"),
		PriceTiers: []ChannelModelPriceTierRequest{{BillingMode: "token", InputTokenPriceMicrocredits: 100, OutputTokenPriceMicrocredits: 200, PriceConfigured: true}},
	}
	savedModel, err := svc.SaveAdminChannelModel(admin, channel.ID, "", reqModel)
	if err != nil {
		t.Fatalf("SaveAdminChannelModel error: %v", err)
	}

	order, err := svc.newBillingOrder("normal_user", "task_1", "req_1", channel.ID, savedModel.ModelKey, "text", "video_reverse", 1, tokenBillingEstimate{InputTokens: 1000, OutputTokens: 1000})
	if err != nil {
		t.Fatalf("newBillingOrder error: %v", err)
	}
	if order.MultiplierBasisPoints != 20_000 {
		t.Fatalf("expected billing order multiplier to be 20000, got %d", order.MultiplierBasisPoints)
	}
}

func TestFeatureCreditFallbackAndAliases(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.User{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}, &model.AdminAuditEvent{}, &model.ModelPricing{}); err != nil {
		t.Fatal(err)
	}

	admin := &model.User{ID: "admin_user", Role: model.UserRoleAdmin}
	user := &model.User{ID: "test_user_fallback", Role: model.UserRoleUser}
	if err := db.Create(user).Error; err != nil {
		t.Fatal(err)
	}

	// 1. 测试未在【功能积分扣减配置】中配置的场景，必须走系统保底扣费 (Fail-closed)
	// 1.1 余额不足时：严格阻断执行，报错提示余额不足
	_, err := svc.DeductFeatureCredits(user, DeductFeatureCreditsRequest{
		Scene: "some_unconfigured_novel_node",
		Model: "gemini-2.5-flash",
	})
	if err == nil || err.Error() != "积分余额不足，请先充值或签到领取积分" {
		t.Fatalf("expected insufficient credits error for unconfigured scene, got %v", err)
	}

	// 1.2 给用户充值 5 积分 (5,000,000 微积分)
	if _, err := svc.AdminAdjustCredits(admin, user.ID, AdminCreditAdjustmentRequest{
		AmountMicrocredits: 5_000_000,
		Note:               "测试充值",
	}); err != nil {
		t.Fatalf("AdminAdjustCredits error: %v", err)
	}

	// 1.3 再次调用未配置的场景，必须保底扣除 1 积分 (1,000,000 微积分)
	deductRes, err := svc.DeductFeatureCredits(user, DeductFeatureCreditsRequest{
		Scene: "some_unconfigured_novel_node",
		Model: "gemini-2.5-flash",
	})
	if err != nil {
		t.Fatalf("DeductFeatureCredits error: %v", err)
	}
	if !deductRes.Charged || deductRes.DeductedMicrocredits != 1_000_000 {
		t.Fatalf("expected fallback charge of 1_000_000 microcredits (1 credit), got charged=%v deducted=%d", deductRes.Charged, deductRes.DeductedMicrocredits)
	}

	// 2. 测试场景别名双向互认
	settings := FeatureCreditSettings{
		Features: map[string]FeatureCreditItem{
			"canvas_video_reverse": {
				Scene:                 "canvas_video_reverse",
				Enabled:               true,
				Mode:                  "token_multiplier",
				MultiplierBasisPoints: 18_000, // 1.8x
			},
			"canvas_material_analysis": {
				Scene:             "canvas_material_analysis",
				Enabled:           true,
				Mode:              "fixed",
				FixedMicrocredits: 3_000_000, // 3 积分
			},
		},
		ModelSceneMultipliers: map[string]map[string]int64{
			"gemini-2.5-flash": {
				"canvas_video_reverse": 22_000, // 2.2x
			},
		},
	}
	if _, err := svc.UpdateFeatureCreditSettings(admin, settings); err != nil {
		t.Fatalf("UpdateFeatureCreditSettings error: %v", err)
	}

	// 2.1 通过旧别名 video_reverse 解析，应能互通匹配到 canvas_video_reverse 的专属倍率 (22_000)
	bps, ok := svc.ResolveModelSceneMultiplier("gemini-2.5-flash", "video_reverse")
	if !ok || bps != 22_000 {
		t.Fatalf("expected 22000 bps for video_reverse alias, got %d (ok=%v)", bps, ok)
	}

	// 2.2 通过 assistant_video_reverse 解析，亦应能互通匹配
	bpsAss, okAss := svc.ResolveModelSceneMultiplier("gemini-2.5-flash", "assistant_video_reverse")
	if !okAss || bpsAss != 22_000 {
		t.Fatalf("expected 22000 bps for assistant_video_reverse alias, got %d (ok=%v)", bpsAss, okAss)
	}

	// 2.3 测试固定点数通过别名 material_analysis 扣减 canvas_material_analysis 的 3 积分
	matDeduct, err := svc.DeductFeatureCredits(user, DeductFeatureCreditsRequest{
		Scene: "material_analysis",
		Model: "gemini-2.5-flash",
	})
	if err != nil {
		t.Fatalf("material_analysis deduct error: %v", err)
	}
	if !matDeduct.Charged || matDeduct.DeductedMicrocredits != 3_000_000 {
		t.Fatalf("expected 3_000_000 microcredits deducted for material_analysis alias, got charged=%v deducted=%d", matDeduct.Charged, matDeduct.DeductedMicrocredits)
	}

	// 3. 测试显式禁用的场景放行免费 (Enabled: false)
	settings.Features["canvas_material_analysis"] = FeatureCreditItem{
		Scene:             "canvas_material_analysis",
		Enabled:           false, // 管理员主动免费
		Mode:              "fixed",
		FixedMicrocredits: 3_000_000,
	}
	if _, err := svc.UpdateFeatureCreditSettings(admin, settings); err != nil {
		t.Fatal(err)
	}
	freeDeduct, err := svc.DeductFeatureCredits(user, DeductFeatureCreditsRequest{
		Scene: "canvas_material_analysis",
		Model: "gemini-2.5-flash",
	})
	if err != nil {
		t.Fatalf("free deduct error: %v", err)
	}
	if freeDeduct.Charged || freeDeduct.DeductedMicrocredits != 0 {
		t.Fatalf("expected charged=false for explicitly disabled scene, got charged=%v deducted=%d", freeDeduct.Charged, freeDeduct.DeductedMicrocredits)
	}
}
// @opc-adapter: feature-credits [end]
