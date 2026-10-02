package repository

import (
	"path/filepath"
	"testing"

	"infinite-canvas/backend/internal/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestCanvasExtensionsSQLiteCompatibility(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "canvas_ext.db")), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })

	// 1. 验证 SQLite 下 AutoMigrate 包含 serializer:json 的模型完全成功且不报错
	if err := db.AutoMigrate(&model.Canvas{}, &model.CanvasNode{}, &model.Approval{}); err != nil {
		t.Fatalf("AutoMigrate failed on sqlite: %v", err)
	}

	repo := New(db)
	userID := "user-ext-1"
	canvasID := "canvas-ext-100"

	// 2. 创建画布
	canvas := model.Canvas{
		ID:          canvasID,
		UserID:      userID,
		Name:        "测试扩展画布",
		Description: "测试描述",
		Metadata: map[string]interface{}{
			"theme": "dark",
			"zoom":  1.25,
		},
	}
	if err := db.Create(&canvas).Error; err != nil {
		t.Fatalf("create canvas failed: %v", err)
	}

	gotCanvas, err := repo.Canvas(userID, canvasID)
	if err != nil {
		t.Fatalf("get canvas failed: %v", err)
	}
	if gotCanvas.Name != "测试扩展画布" || gotCanvas.Metadata["theme"] != "dark" {
		t.Fatalf("canvas mismatch: %+v", gotCanvas)
	}

	// 3. 创建画布节点（包含复合数据：Position, Size, Children, Metadata）
	node1 := model.CanvasNode{
		ID:       "node-1",
		CanvasID: canvasID,
		Type:     "video_gen",
		Content:  "生成一段日落视频",
		Position: &model.CanvasPosition{X: 100.5, Y: 200.5},
		Size:     &model.CanvasSize{Width: 320, Height: 240},
		Children: []string{"child-1", "child-2"},
		Metadata: map[string]interface{}{
			"ratio": "16:9",
			"steps": float64(20),
		},
	}
	createdNode1, err := repo.CreateCanvasNode(userID, canvasID, node1)
	if err != nil {
		t.Fatalf("create node1 failed: %v", err)
	}
	if createdNode1.Position.X != 100.5 || len(createdNode1.Children) != 2 {
		t.Fatalf("created node mismatch: %+v", createdNode1)
	}

	// 4. 查询单个节点与所有节点
	fetchedNode1, err := repo.CanvasNode(userID, canvasID, "node-1")
	if err != nil {
		t.Fatalf("fetch node1 failed: %v", err)
	}
	if fetchedNode1.Content != "生成一段日落视频" || fetchedNode1.Metadata["ratio"] != "16:9" {
		t.Fatalf("fetched node mismatch: %+v", fetchedNode1)
	}

	nodes, err := repo.CanvasNodes(userID, canvasID)
	if err != nil {
		t.Fatalf("fetch canvas nodes failed: %v", err)
	}
	if len(nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(nodes))
	}

	// 5. 更新节点字段
	newContent := "更新后的提示词"
	update := model.CanvasNodeUpdate{
		Content: &newContent,
		Position: &model.CanvasPosition{X: 300, Y: 400},
	}
	updatedNode1, err := repo.UpdateCanvasNode(userID, canvasID, "node-1", update)
	if err != nil {
		t.Fatalf("update node failed: %v", err)
	}
	if updatedNode1.Content != newContent || updatedNode1.Position.X != 300 {
		t.Fatalf("updated node mismatch: %+v", updatedNode1)
	}

	// 6. 测试创建子节点与层级关系
	parentID := "node-1"
	node2 := model.CanvasNode{
		ID:       "node-2",
		CanvasID: canvasID,
		Type:     "video_upscale",
		ParentID: &parentID,
		Position: &model.CanvasPosition{X: 500, Y: 400},
		Size:     &model.CanvasSize{Width: 320, Height: 240},
	}
	if _, err := repo.CreateCanvasNode(userID, canvasID, node2); err != nil {
		t.Fatalf("create child node failed: %v", err)
	}

	children, err := repo.GetCanvasNodeChildren(userID, canvasID, "node-1")
	if err != nil {
		t.Fatalf("get children failed: %v", err)
	}
	if len(children) != 1 || children[0].ID != "node-2" {
		t.Fatalf("children mismatch: %+v", children)
	}

	// 7. 测试关联关系存储与删除
	rel := model.CanvasRelationship{
		From: "node-1",
		To:   "node-2",
		Type: "flow",
	}
	if err := repo.CreateCanvasRelationship(userID, canvasID, rel); err != nil {
		t.Fatalf("create relationship failed: %v", err)
	}

	if err := repo.DeleteCanvasRelationship(userID, canvasID, "node-1", "node-2", "flow"); err != nil {
		t.Fatalf("delete relationship failed: %v", err)
	}

	// 8. 测试 Approval 审批请求
	approval := &model.Approval{
		ID:       "appr-1",
		UserID:   userID,
		RunID:    "run-123",
		ToolName: "generate_video",
		Data: map[string]any{
			"prompt": "high risk generation",
		},
		Status: "pending",
	}
	if err := repo.CreateApproval(approval); err != nil {
		t.Fatalf("create approval failed: %v", err)
	}

	gotApproval, err := repo.GetApproval("appr-1")
	if err != nil {
		t.Fatalf("get approval failed: %v", err)
	}
	if gotApproval.Status != "pending" || gotApproval.Data["prompt"] != "high risk generation" {
		t.Fatalf("approval mismatch: %+v", gotApproval)
	}

	if err := repo.UpdateApprovalDecision("appr-1", "approved"); err != nil {
		t.Fatalf("update approval decision failed: %v", err)
	}
	gotApprovalAfter, _ := repo.GetApproval("appr-1")
	if gotApprovalAfter.Status != "completed" || gotApprovalAfter.Decision != "approved" {
		t.Fatalf("updated approval mismatch: %+v", gotApprovalAfter)
	}

	// 9. 递归删除父节点及子节点
	if err := repo.DeleteCanvasNode(userID, canvasID, "node-1", true); err != nil {
		t.Fatalf("recursive delete failed: %v", err)
	}
	remainingNodes, _ := repo.CanvasNodes(userID, canvasID)
	if len(remainingNodes) != 0 {
		t.Fatalf("expected 0 remaining nodes after recursive delete, got %d", len(remainingNodes))
	}
}
