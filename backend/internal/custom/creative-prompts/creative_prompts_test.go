package creativeprompts

import (
	"testing"

	"infinite-canvas/backend/internal/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite in memory: %v", err)
	}
	if err := db.AutoMigrate(&model.CreativePromptTemplate{}); err != nil {
		t.Fatalf("failed to auto migrate: %v", err)
	}
	return db
}

func TestCreativePromptsSeedAndCRUD(t *testing.T) {
	db := setupTestDB(t)

	// 1. Auto-seed
	if err := SeedDefaultTemplates(db); err != nil {
		t.Fatalf("failed to seed: %v", err)
	}

	// 2. Query all templates
	all, err := ListTemplates(db, "user_123", "all")
	if err != nil {
		t.Fatalf("failed to list all: %v", err)
	}
	if len(all) != 19 {
		t.Errorf("expected 19 builtin templates, got %d", len(all))
	}

	// 3. Query image templates (改图提示词)
	imageTemplates, err := ListTemplates(db, "user_123", "image")
	if err != nil {
		t.Fatalf("failed to list image templates: %v", err)
	}
	if len(imageTemplates) != 6 {
		t.Errorf("expected 6 image templates, got %d", len(imageTemplates))
	}

	// 4. Query video templates (生视频提示词)
	videoTemplates, err := ListTemplates(db, "user_123", "video")
	if err != nil {
		t.Fatalf("failed to list video templates: %v", err)
	}
	if len(videoTemplates) != 7 {
		t.Errorf("expected 7 video templates, got %d", len(videoTemplates))
	}

	// 5. Query drama templates (短剧提示词)
	dramaTemplates, err := ListTemplates(db, "user_123", "drama")
	if err != nil {
		t.Fatalf("failed to list drama templates: %v", err)
	}
	if len(dramaTemplates) != 6 {
		t.Errorf("expected 6 drama templates, got %d", len(dramaTemplates))
	}

	// 6. Create custom template
	custom := &model.CreativePromptTemplate{
		Kind:     "image",
		Name:     "我的测试电商提示词",
		Category: "测试分类",
		Tags:     "电商,测试",
		Content:  "测试内容：高清白底图产品展示",
	}
	saved, err := SaveTemplate(db, "user_123", custom)
	if err != nil {
		t.Fatalf("failed to save custom template: %v", err)
	}
	if saved.ID == "" || saved.IsBuiltin {
		t.Errorf("invalid saved template: %+v", saved)
	}

	// 7. Verify user can list newly created template
	userImages, err := ListTemplates(db, "user_123", "image")
	if err != nil {
		t.Fatalf("failed to list user templates: %v", err)
	}
	if len(userImages) != 7 {
		t.Errorf("expected 7 image templates (6 builtin + 1 custom), got %d", len(userImages))
	}

	// 8. Update custom template
	saved.Name = "我的测试电商提示词(更新)"
	saved.Content = "更新后的内容"
	updated, err := SaveTemplate(db, "user_123", saved)
	if err != nil {
		t.Fatalf("failed to update template: %v", err)
	}
	if updated.Name != "我的测试电商提示词(更新)" {
		t.Errorf("expected updated name, got %s", updated.Name)
	}

	// 9. IDOR & Builtin Protection Security Tests
	// 9.1 User B cannot update User A's template
	_, err = SaveTemplate(db, "user_456", updated)
	if err == nil {
		t.Errorf("expected error when user_456 tries to update user_123's template, got nil")
	}

	// 9.2 User B cannot delete User A's template
	err = DeleteTemplate(db, "user_456", saved.ID)
	if err == nil {
		t.Errorf("expected error when user_456 tries to delete user_123's template, got nil")
	}

	// 9.3 Cannot delete or overwrite builtin templates
	err = DeleteTemplate(db, "user_123", "builtin_img_product_consistency_storyboard")
	if err == nil {
		t.Errorf("expected error when deleting builtin template, got nil")
	}
	builtinItem := &model.CreativePromptTemplate{
		ID:      "builtin_img_product_consistency_storyboard",
		Name:    "尝试篡改内置",
		Content: "篡改正文",
	}
	_, err = SaveTemplate(db, "user_123", builtinItem)
	if err == nil {
		t.Errorf("expected error when updating builtin template, got nil")
	}

	// 10. Delete custom template by legitimate owner
	if err := DeleteTemplate(db, "user_123", saved.ID); err != nil {
		t.Fatalf("failed to delete template: %v", err)
	}

	afterDelete, err := ListTemplates(db, "user_123", "image")
	if err != nil {
		t.Fatalf("failed to list after delete: %v", err)
	}
	if len(afterDelete) != 6 {
		t.Errorf("expected 6 templates after delete, got %d", len(afterDelete))
	}
}
