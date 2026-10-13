package app

import (
	"encoding/json"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func mustEncodeModelCapabilityConfig(t *testing.T, config *ModelCapabilityConfig) string {
	t.Helper()
	encoded, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}

func TestNormalizeChannelModelContract(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "test-key"}
	modelKey, providerModelKey, capability, protocol, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "models/gpt-test", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
	})
	if err != nil {
		t.Fatalf("normalizeChannelModelContract() error = %v", err)
	}
	if modelKey != "gpt-test" || providerModelKey != "gpt-test" || capability != "text" || protocol != model.ChannelInterfaceChatCompletion {
		t.Fatalf("contract = %q, %q, %q, %q", modelKey, providerModelKey, capability, protocol)
	}
}

func TestNormalizeChannelModelContractPreservesProviderModelKey(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "test-key"}
	modelKey, providerModelKey, _, _, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "seedance-2-5-480p", ProviderModelKey: "models/doubao-seedance-2-5", Capability: "video", Protocol: string(model.ChannelInterfaceVolcengineArkVideo),
	})
	if err != nil {
		t.Fatalf("normalizeChannelModelContract() error = %v", err)
	}
	if modelKey != "seedance-2-5-480p" || providerModelKey != "doubao-seedance-2-5" {
		t.Fatalf("contract = %q, %q", modelKey, providerModelKey)
	}
}

func TestNormalizeChannelModelContractRejectsCapabilityMismatch(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "test-key"}
	_, _, _, _, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "image-test", Capability: "text", Protocol: string(model.ChannelInterfaceOpenAIImage),
	})
	if err == nil {
		t.Fatal("normalizeChannelModelContract() should reject a mismatched capability")
	}
}

func TestNormalizeChannelModelContractRequiresJiMengSecret(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "access-key"}
	_, _, _, _, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "jimeng-test", Capability: "image", Protocol: string(model.ChannelInterfaceVolcengineJiMengImage),
	})
	if err == nil {
		t.Fatal("normalizeChannelModelContract() should require JiMeng credentials")
	}
}

func TestSaveAdminChannelModelPersistsAndPublishesIcon(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: "https://example.com/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true
	saved, err := svc.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{
		ModelKey: "gpt-test", DisplayName: "GPT Test", Icon: "OpenAI", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
		CapabilityConfig: DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "gpt-test"),
		PriceTiers:       []ChannelModelPriceTierRequest{{BillingMode: "fixed_request", PriceConfigured: true, Enabled: &enabled}}, Enabled: &enabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Icon != "OpenAI" {
		t.Fatalf("saved icon = %q, want OpenAI", saved.Icon)
	}
	var stored model.ChannelModel
	if err := db.First(&stored, "id = ?", saved.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Icon != "OpenAI" {
		t.Fatalf("stored icon = %q, want OpenAI", stored.Icon)
	}
	public, err := svc.sanitizeChannelModel(saved)
	if err != nil {
		t.Fatal(err)
	}
	if public.Icon != "OpenAI" {
		t.Fatalf("public icon = %q, want OpenAI", public.Icon)
	}
	legacyPublic := publicChannel(channel, false, []model.ChannelModel{*saved})
	if len(legacyPublic.ModelCosts) != 1 || legacyPublic.ModelCosts[0].Icon != "OpenAI" {
		t.Fatalf("legacy public model costs = %#v", legacyPublic.ModelCosts)
	}
}

// @opc-adapter: seedance-jimeng-icon-governance [start]
func TestSaveAdminChannelModelNormalizesSeedanceToJimeng(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-sd", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test SD", BaseURL: "https://example.com/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true

	// 1. 显式 ByteDance 图标的 Seedance 模型自动归一化为 Jimeng
	savedSd, err := svc.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{
		ModelKey: "seedance-2.5", DisplayName: "Seedance 2.5", Icon: "ByteDance", Capability: "video", Protocol: "seedance-videos-compatible",
		CapabilityConfig: DefaultModelCapabilityConfigForModel("seedance-videos-compatible", "seedance-2.5"),
		PriceTiers:       []ChannelModelPriceTierRequest{{BillingMode: "per_second", PriceConfigured: true, Enabled: &enabled, UnitPriceMicrocredits: 100000}}, Enabled: &enabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	if savedSd.Icon != "Jimeng" {
		t.Fatalf("saved icon = %q, want Jimeng", savedSd.Icon)
	}
	var storedSd model.ChannelModel
	if err := db.First(&storedSd, "id = ?", savedSd.ID).Error; err != nil {
		t.Fatal(err)
	}
	if storedSd.Icon != "Jimeng" {
		t.Fatalf("stored icon = %q, want Jimeng", storedSd.Icon)
	}

	// 2. 空图标的 sd2.0 / dola 模型自动推导为 Jimeng
	savedMini, err := svc.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{
		ModelKey: "sd2.0-720p", DisplayName: "Seedance 2.0", Icon: "", Capability: "video", Protocol: "lxmone-sd-videos",
		CapabilityConfig: DefaultModelCapabilityConfigForModel("lxmone-sd-videos", "sd2.0-720p"),
		PriceTiers:       []ChannelModelPriceTierRequest{{BillingMode: "per_second", PriceConfigured: true, Enabled: &enabled, UnitPriceMicrocredits: 100000}}, Enabled: &enabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	if savedMini.Icon != "Jimeng" {
		t.Fatalf("saved mini icon = %q, want Jimeng", savedMini.Icon)
	}

	// 3. 非 Seedance 模型的独立图标保持原样不受影响
	savedWan, err := svc.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{
		ModelKey: "wan3.0-video", DisplayName: "wan3.0", Icon: "Alibaba", Capability: "video", Protocol: "lxmone-wan-videos",
		CapabilityConfig: DefaultModelCapabilityConfigForModel("lxmone-wan-videos", "wan3.0-video"),
		PriceTiers:       []ChannelModelPriceTierRequest{{BillingMode: "per_second", PriceConfigured: true, Enabled: &enabled, UnitPriceMicrocredits: 100000}}, Enabled: &enabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	if savedWan.Icon != "Alibaba" {
		t.Fatalf("saved wan icon = %q, want Alibaba", savedWan.Icon)
	}
}
// @opc-adapter: seedance-jimeng-icon-governance [end]

func TestSanitizeChannelModelRejectsCorruptCapabilityConfig(t *testing.T) {
	svc := &Service{}
	_, err := svc.sanitizeChannelModel(&model.ChannelModel{
		ID:                   "broken-image-model",
		Capability:           "image",
		CapabilityConfigJSON: `{`,
	})
	if err == nil {
		t.Fatal("sanitizeChannelModel() should reject corrupt capability JSON")
	}
}

func TestSanitizeChannelModelAvailabilityRequiresValidPriceTier(t *testing.T) {
	svc := &Service{}
	channelModel := &model.ChannelModel{
		ID:                    "image-model",
		ModelKey:              "image-model",
		Capability:            "image",
		Protocol:              model.ChannelInterfaceOpenAIImage,
		CapabilityConfigJSON:  mustEncodeModelCapabilityConfig(t, DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceOpenAIImage), "image-model")),
		PriceConfigured:       true,
		BillingMode:           "fixed_request",
		UnitPriceMicrocredits: 10,
	}

	public, err := svc.sanitizeChannelModel(channelModel)
	if err != nil {
		t.Fatal(err)
	}
	if public.Available {
		t.Fatal("legacy scalar price must not make a system channel model available")
	}

	channelModel.PriceTiers = []model.ChannelModelPriceTier{{
		ID: "tier-1", BillingMode: "fixed_request", UnitPriceMicrocredits: 10,
		Enabled: true, PriceConfigured: true,
	}}
	public, err = svc.sanitizeChannelModel(channelModel)
	if err != nil {
		t.Fatal(err)
	}
	if !public.Available || len(public.PriceTiers) != 1 {
		t.Fatalf("valid price tier was not published: %#v", public)
	}
}

func TestChannelModelMatchesIntentUsesPersistedCapabilityContract(t *testing.T) {
	svc := &Service{}
	profile := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceOpenAIImage), "image-model")
	profile.Image.References.MaxImages = 1
	channelModel := &model.ChannelModel{
		ID:                   "image-model",
		ModelKey:             "image-model",
		Capability:           "image",
		Protocol:             model.ChannelInterfaceOpenAIImage,
		CapabilityConfigJSON: mustEncodeModelCapabilityConfig(t, profile),
	}

	matched, err := svc.channelModelMatchesIntent(channelModel, &ModelRequestIntent{
		Capability: "image",
		Inputs:     map[string]int{"image": 2},
	})
	if err != nil {
		t.Fatal(err)
	}
	if matched {
		t.Fatal("request exceeding the persisted reference-image limit should not match")
	}

	channelModel.CapabilityConfigJSON = `{`
	if _, err := svc.channelModelMatchesIntent(channelModel, &ModelRequestIntent{Capability: "image"}); err == nil {
		t.Fatal("corrupt persisted capability config should fail closed")
	}
}

func TestPublicSystemChannelCatalogIsolatesCorruptModel(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	channel := model.ModelChannel{ID: "system-channel", Scope: model.ChannelScopeSystem, Enabled: true, Name: "系统渠道"}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	validConfig := mustEncodeModelCapabilityConfig(t, DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceOpenAIImage), "valid-model"))
	models := []model.ChannelModel{
		{ID: "valid-model", ChannelID: channel.ID, ModelKey: "valid-model", Capability: "image", Protocol: model.ChannelInterfaceOpenAIImage, CapabilityConfigJSON: validConfig, Enabled: true},
		{ID: "broken-model", ChannelID: channel.ID, ModelKey: "broken-model", Capability: "image", Protocol: model.ChannelInterfaceOpenAIImage, CapabilityConfigJSON: `{`, Enabled: true},
	}
	for index := range models {
		if err := db.Create(&models[index]).Error; err != nil {
			t.Fatal(err)
		}
	}

	catalog, err := svc.publicSystemChannelCatalog(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog) != 1 || len(catalog[0].Models) != 1 || catalog[0].Models[0].ID != "valid-model" {
		t.Fatalf("catalog should retain only the valid model: %#v", catalog)
	}
}

func TestImageTestDefaultsUseModelCapability(t *testing.T) {
	tests := []struct {
		name        string
		profile     *ImageCapabilityConfig
		wantSize    string
		wantQuality string
	}{
		{name: "legacy fallback", wantSize: "1024x1024", wantQuality: "auto"},
		{
			name: "fixed 2k model",
			profile: &ImageCapabilityConfig{
				Size:    ImageSizeConfig{Parameter: "size", Default: "2048x2048"},
				Quality: ImageQualityConfig{Supported: false, Default: "auto"},
			},
			wantSize: "2048x2048",
		},
		{
			name: "provider selected size",
			profile: &ImageCapabilityConfig{
				Size:    ImageSizeConfig{Parameter: "none", Default: "auto"},
				Quality: ImageQualityConfig{Supported: false},
			},
		},
		{
			name: "gpt image capability",
			profile: &ImageCapabilityConfig{
				Size:    ImageSizeConfig{Parameter: "size", Default: "1024x1536"},
				Quality: ImageQualityConfig{Supported: true, Default: "high"},
			},
			wantSize: "1024x1536", wantQuality: "high",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			size, quality := imageTestDefaults(test.profile)
			if size != test.wantSize || quality != test.wantQuality {
				t.Fatalf("imageTestDefaults() = %q, %q; want %q, %q", size, quality, test.wantSize, test.wantQuality)
			}
		})
	}
}
