package model

import (
	"time"
)

// Canvas 数据模型扩展

// Canvas 画布
type Canvas struct {
	ID          string                 `json:"id" gorm:"primaryKey"`
	UserID      string                 `json:"userId" gorm:"index"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Metadata    map[string]interface{} `json:"metadata" gorm:"serializer:json;type:text"`
	CreatedAt   time.Time              `json:"createdAt"`
	UpdatedAt   time.Time              `json:"updatedAt"`
}

func (Canvas) TableName() string {
	return "canvases"
}

// CanvasNode 画布节点
type CanvasNode struct {
	ID        string                 `json:"id" gorm:"primaryKey"`
	CanvasID  string                 `json:"canvasId" gorm:"index"`
	Type      string                 `json:"type"`
	Content   string                 `json:"content" gorm:"type:text"`
	Position  *CanvasPosition        `json:"position" gorm:"serializer:json;type:text"`
	Size      *CanvasSize            `json:"size" gorm:"serializer:json;type:text"`
	ParentID  *string                `json:"parentId" gorm:"index"`
	Children  []string               `json:"children" gorm:"serializer:json;type:text"`
	Metadata  map[string]interface{} `json:"metadata" gorm:"serializer:json;type:text"`
	CreatedAt time.Time              `json:"createdAt"`
	UpdatedAt time.Time              `json:"updatedAt"`
}

func (CanvasNode) TableName() string {
	return "canvas_nodes"
}

// CanvasPosition 节点位置
type CanvasPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// CanvasSize 节点尺寸
type CanvasSize struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// CanvasNodeUpdate 节点更新请求
type CanvasNodeUpdate struct {
	Content  *string                `json:"content,omitempty"`
	Position *CanvasPosition        `json:"position,omitempty"`
	Size     *CanvasSize            `json:"size,omitempty"`
	ParentID *string                `json:"parentId,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// CanvasRelationship 节点关系
type CanvasRelationship struct {
	From string `json:"from"`
	To   string `json:"to"`
	Type string `json:"type"` // parent, reference, dependency, flow
}

// Approval 审批请求
type Approval struct {
	ID        string         `json:"id" gorm:"primaryKey"`
	UserID    string         `json:"userId" gorm:"index"`
	RunID     string         `json:"runId" gorm:"index"`
	ToolName  string         `json:"toolName"`
	Data      map[string]any `json:"data" gorm:"serializer:json;type:text"`
	Status    string         `json:"status"` // pending, approved, rejected
	Decision  string         `json:"decision"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

func (Approval) TableName() string {
	return "approvals"
}
