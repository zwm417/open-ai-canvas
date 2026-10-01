package creativeprompts

import (
	"errors"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

var defaultBuiltinTemplates = []model.CreativePromptTemplate{
	// ─── 1. 生图提示词 (Image) ───
	{
		ID:        "builtin_img_product_consistency_storyboard",
		Kind:      "image",
		Name:      "产品一致性故事板",
		Category:  "改图提示词",
		Tags:      "电商,分镜,一致性,改图",
		IsBuiltin: true,
		Content: `你是一个专门为电商短视频做"产品一致性故事板"的提示词生成器。

【输入】用户给你一张或多张产品图（详情页截图/白底图/文案/链接均可）。

【你的任务】
基于输入的产品图，输出一段可直接喂给 img-to-image 生图模型的故事板提示词组，确保后续生成的所有分镜画面中，产品保持100%一致（颜色/材质/版型/细节/logo位置完全相同）。

━━━━━━━━━━━━━━━━━━━━
■ 构图铁律（CRITICAL）
━━━━━━━━━━━━━━━━━━━━
1. 如果输入中包含白底图 → 必须将白底图作为故事板的"主视觉锚点"，放在最大、最近、最清晰的展示位（占整张故事板视觉面积的30%以上），其他分镜以缩略图形式围绕排布
2. 主视觉锚点的产品必须满足：
   - 占画面60%以上
   - 1:1 或近距离镜头（产品边缘清晰、纹理可辨）
   - 纯白/纯灰背景，无任何干扰元素
   - 分辨率优先（同等条件下选最高清的白底图）
3. 如果没有白底图，则从所有输入图中选"产品最大、最清晰、背景最干净"的一张作为主视觉锚点
4. 其他参考图（场景图、模特图、细节图）作为辅助视觉，缩略排布在主图周围，不抢主图位置
5. 故事板里所有产品缩略图最小边长不得低于主图的1/3，避免AI识别失真

━━━━━━━━━━━━━━━━━━━━
■ 产品DNA锁定（PRODUCT LOCK）
━━━━━━━━━━━━━━━━━━━━
从主视觉锚点（白底图优先）提取以下5个维度：
- 颜色：具体色名 + 饱和度 + 冷暖
- 材质：面料/工艺 + 光泽度 + 厚度
- 版型/形态：轮廓 + 关键结构
- 标志性细节：logo位置、装饰、印花、按键、瓶口等
- 不可变特征：任何使该产品区别于同类的细节

━━━━━━━━━━━━━━━━━━━━
■ 全局风格锁（GLOBAL STYLE LOCK）
━━━━━━━━━━━━━━━━━━━━
人物（如有）：年龄、发型、配饰、肤色，固定不变
灯光：自然光/影棚光/特定色温
风格：电影级写实/清新日系/极简产品摄影 等
相机参数：焦段、光圈、ISO

━━━━━━━━━━━━━━━━━━━━
■ 分镜提示词组（SHOTS）
━━━━━━━━━━━━━━━━━━━━
分镜数量按品类自动判断：
- 服饰类：8镜
- 美妆类：6镜
- 食饮类：5镜
- 3C/家居：6镜

【镜号XX · 镜头名称】
景别：远景/中景/近景/特写
环境：具体场景描述
动作：主体动作
情绪/氛围：一句话
提示词：[PRODUCT LOCK] + [GLOBAL STYLE LOCK] + 本镜变量描述

【铁律】
- 主视觉锚点（白底图）必须以最大尺寸出现在故事板顶部C位
- 不允许出现产品参考图小于100×100像素的情况
- 颜色描述必须精确到色调倾向
- 材质必须包含光泽度
- 输入图信息不足时标注"待补充"，不要猜测`,
	},
	{
		ID:        "builtin_img_generate_model_prompt",
		Kind:      "image",
		Name:      "生成模特提示词",
		Category:  "改图提示词",
		Tags:      "模特,四宫格,白底图,人像",
		IsBuiltin: true,
		Content:   "根据这两个人物的五官、发型、皮肤等所有细节 ，生成人物的四宫格形象图，背景白色  ，第一张头部正面、第二张头部侧面、第三张头部背面、第四张头部45度侧面。不要塑料陶瓷肌。去掉所有字幕。",
	},
	{
		ID:        "builtin_img_model_and_change_clothes",
		Kind:      "image",
		Name:      "生模特+换服装",
		Category:  "改图提示词",
		Tags:      "换装,模特,四宫格,服饰",
		IsBuiltin: true,
		Content:   "人物的五官、发型、皮肤等所有细节参考@图片2 和@图片1 ，全身服装参考@图片3  ，背景白色，生成人物的四宫格形象图，第一张全身正面、第二张全身侧面、第三张半身背面、第四张脸部特写。不要塑料陶瓷肌。去掉字幕。",
	},
	{
		ID:        "builtin_img_replace_product",
		Kind:      "image",
		Name:      "生图换产品",
		Category:  "改图提示词",
		Tags:      "换产品,电商,商品替换",
		IsBuiltin: true,
		Content:   "把@图片1 分镜图中的脚上穿的袜子和地上放的袜子，替换成@图片2 @图片3 @图片4 @图片5 @图片6，其他都不变",
	},
	{
		ID:        "builtin_img_storyboard_puzzle_replace",
		Kind:      "image",
		Name:      "分镜拼图替换",
		Category:  "改图提示词",
		Tags:      "拼图,分镜,背景替换",
		IsBuiltin: true,
		Content:   "把【图7】拼图里面的每个画面用【图5】的背景替换",
	},
	{
		ID:        "builtin_img_real_human_four_grid",
		Kind:      "image",
		Name:      "生成真人四宫格",
		Category:  "改图提示词",
		Tags:      "素人感,四宫格,形象图,写实",
		IsBuiltin: true,
		Content:   "人物的五官、发型、皮肤等所有细节参考 【图4】 ，全身服装参考 【图6】 ，生成人物的四宫格形象白底图，第一张全身正面、第二张全身侧面、第三张半身背面、第四张脸部特写。不要塑料陶瓷肌，不要网感，要求超绝真实素人感。并且去掉图片上的字幕。",
	},

	// ─── 2. 生视频提示词 (Video) ───
	{
		ID:        "builtin_vid_swap_head_and_voice",
		Kind:      "video",
		Name:      "生视频换头换音色",
		Category:  "生视频提示词",
		Tags:      "换脸,换头,换音色,口播",
		IsBuiltin: true,
		Content: `我已经把@视频1 里的模特的面部打了马赛克，现在请你把这个打了马赛克的人脸换成@图片1
口播的口音音色参考@音频1 ，并且去掉所有字幕和符号水印
其他任何细节不要变`,
	},
	{
		ID:        "builtin_vid_swap_head_only",
		Kind:      "video",
		Name:      "生视频换头不换音色",
		Category:  "生视频提示词",
		Tags:      "换头,换脸,保音色",
		IsBuiltin: true,
		Content: `我已经把@视频1 里的模特的面部打了马赛克，现在请你把这个打了马赛克的人脸换成@图片1
并且去掉所有字幕和符号水印
其他任何细节不要变`,
	},
	{
		ID:        "builtin_vid_swap_model_and_clothes",
		Kind:      "video",
		Name:      "生视频换模特+服饰",
		Category:  "生视频提示词",
		Tags:      "换人,换装,去水印",
		IsBuiltin: true,
		Content: `我已经把@视频1 里的模特的面部打了马赛克，现在请你把这个打了马赛克的模特的全身包括脸换成@图片1 ，并且去掉所有字幕和符号水印
其他任何细节不要变`,
	},
	{
		ID:        "builtin_vid_replace_product",
		Kind:      "video",
		Name:      "生视频+替换产品",
		Category:  "生视频提示词",
		Tags:      "商品替换,运镜参考,短视频",
		IsBuiltin: true,
		Content: `把@视频1 里的脚上穿的袜子和地方放的袜子替换成@图片2 @图片3 @图片4 @图片5 @图片6 ，运镜参考分镜图@图片2
去掉所有字幕和水印符号
其他任何细节不要变`,
	},
	{
		ID:        "builtin_vid_reverse_text_to_video",
		Kind:      "video",
		Name:      "反推生视频提示词",
		Category:  "生视频提示词",
		Tags:      "反推,分镜头脚本,生成",
		IsBuiltin: true,
		Content: `人物参考：@图片   产品参考：@图片    视频不添加任何字幕
（AI反推出来的分镜头脚本提示词复制粘贴过来）`,
	},
	{
		ID:        "builtin_vid_reverse_video_prompt",
		Kind:      "video",
		Name:      "反推视频提示词",
		Category:  "生视频提示词",
		Tags:      "反推,拆解分镜,文本呈现",
		IsBuiltin: true,
		Content:   "按照分镜拆解这条视频@视频1 ，文本呈现，不要表格，视频人物场景、服饰、画面、动作、口播、语气都要详细写出来，越详细越好。并把产品替换成@图片（如果产品和原视频不一致，可以添加产品图片）",
	},
	{
		ID:        "builtin_vid_consistency_clone",
		Kind:      "video",
		Name:      "生视频提示词 (一致性复刻)",
		Category:  "生视频提示词",
		Tags:      "复刻,一致性,电商商品,长文本",
		IsBuiltin: true,
		Content: `视频不添加任何字幕。
视频生成基于【视频1】进行一致性复刻：整体按原视频节奏连续生成，保持动作流程、镜头切换、镜头运动节奏和逻辑一致，构图与光影风格保持相同，禁止新增无关元素或镜头风格偏离。
商品一致性参考【图2】：
所有镜头中的商品必须严格保持与【图2】一致，包括颜色、材质、结构比例、轮廓、纹理、logo/标签位置和可见细节。
不得根据文案自行改变商品外观，不得改变商品固有色、比例、关键结构和可见材质。`,
	},

	// ─── 3. 短剧提示词 (Drama) ───
	{
		ID:        "builtin_drama_character_sheet",
		Kind:      "drama",
		Name:      "角色设定图",
		Category:  "短剧提示词",
		Tags:      "短剧,角色设定,三视图,一致性",
		IsBuiltin: true,
		Content:   "生成角色设定图：保持同一角色身份、五官、发型、服装和体态一致，包含正面、侧面、背面和关键表情参考，背景简洁，便于后续镜头复用。",
	},
	{
		ID:        "builtin_drama_multi_angle",
		Kind:      "drama",
		Name:      "多机位视角",
		Category:  "短剧提示词",
		Tags:      "短剧,多机位,全景,特写,连续性",
		IsBuiltin: true,
		Content:   "围绕同一主体设计多机位画面，保持人物、服装、场景和光线一致，分别给出远景、全景、中景、近景、特写、侧面、背面和俯拍视角，镜头之间具有连续性。",
	},
	{
		ID:        "builtin_drama_next_shot",
		Kind:      "drama",
		Name:      "画面推演",
		Category:  "短剧提示词",
		Tags:      "短剧,动作推演,衔接,镜头递进",
		IsBuiltin: true,
		Content:   "基于当前画面推演下一个连续镜头：保持角色和场景一致，明确主体接下来的动作、视线、环境变化、镜头运动和自然衔接方式，不要跳变构图或身份。",
	},
	{
		ID:        "builtin_drama_story_beats",
		Kind:      "drama",
		Name:      "连续镜头",
		Category:  "短剧提示词",
		Tags:      "短剧,连续节拍,镜头拆解,分镜",
		IsBuiltin: true,
		Content:   "把这段内容拆成连续镜头节拍。每个镜头写清主体动作、景别、构图、机位、运镜、光线、情绪和与前后镜头的衔接，并保持角色、场景和道具一致。",
	},
	{
		ID:        "builtin_drama_cinematic_light",
		Kind:      "drama",
		Name:      "电影光影优化",
		Category:  "短剧提示词",
		Tags:      "短剧,电影质感,光影,去塑料感",
		IsBuiltin: true,
		Content:   "保留主体身份、动作和原始构图，优化为真实电影摄影光线：明确主光方向、环境反射、阴影层次、肤色和背景融合，降低塑料感与过度锐化，不改变画面内容。",
	},
	{
		ID:        "builtin_drama_video_prompt_struct",
		Kind:      "drama",
		Name:      "视频提示词优化",
		Category:  "短剧提示词",
		Tags:      "短剧,结构化,时序镜头,运镜指令",
		IsBuiltin: true,
		Content:   "将当前要求改写为结构化视频提示词，按时间顺序描述开场画面、主体动作、镜头运动、环境变化、声音和结束画面；消除冲突指令，保留所有关键约束。",
	},
}

// SeedDefaultTemplates 在数据库初始化或模板缺失时自动补全默认内置模板
func SeedDefaultTemplates(db *gorm.DB) error {
	for _, item := range defaultBuiltinTemplates {
		var count int64
		if err := db.Model(&model.CreativePromptTemplate{}).Where("id = ?", item.ID).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			now := time.Now().UTC()
			item.CreatedAt = now
			item.UpdatedAt = now
			if err := db.Create(&item).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// EnsureBuiltinTemplates 高效检测内置模板是否就绪，杜绝每次列表请求 N+1 次 COUNT 查询
func EnsureBuiltinTemplates(db *gorm.DB) error {
	var count int64
	if err := db.Model(&model.CreativePromptTemplate{}).Where("is_builtin = ?", true).Count(&count).Error; err != nil {
		return err
	}
	if count < int64(len(defaultBuiltinTemplates)) {
		return SeedDefaultTemplates(db)
	}
	return nil
}

// ListTemplates 获取指定用户可见的提示词模板列表（包含内置与用户自定义）
func ListTemplates(db *gorm.DB, userID string, kind string) ([]model.CreativePromptTemplate, error) {
	_ = EnsureBuiltinTemplates(db)

	query := db.Model(&model.CreativePromptTemplate{})
	if strings.TrimSpace(kind) != "" && kind != "all" {
		query = query.Where("kind = ?", strings.TrimSpace(kind))
	}

	if strings.TrimSpace(userID) != "" {
		query = query.Where("is_builtin = ? OR user_id = ?", true, userID)
	} else {
		query = query.Where("is_builtin = ?", true)
	}

	var list []model.CreativePromptTemplate
	if err := query.Order("is_builtin DESC, updated_at DESC").Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}

// SaveTemplate 保存或更新提示词模板（严格防范多租户越权与内置模板覆写）
func SaveTemplate(db *gorm.DB, userID string, item *model.CreativePromptTemplate) (*model.CreativePromptTemplate, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("用户未登录或无权保存模板")
	}
	if strings.TrimSpace(item.Name) == "" {
		return nil, errors.New("模板名称不能为空")
	}
	if strings.TrimSpace(item.Content) == "" {
		return nil, errors.New("模板内容不能为空")
	}

	kind := strings.ToLower(strings.TrimSpace(item.Kind))
	if kind != "image" && kind != "video" && kind != "drama" {
		kind = "image"
	}
	item.Kind = kind

	// 强制安全隔离：用户保存的模板永远为当前用户的私有自定义模板
	item.UserID = userID
	item.IsBuiltin = false

	now := time.Now().UTC()
	item.UpdatedAt = now

	// 1. 新建模板
	if strings.TrimSpace(item.ID) == "" {
		item.ID = "cpt_" + time.Now().Format("20060102150405") + "_" + kind
		item.CreatedAt = now
		if err := db.Create(item).Error; err != nil {
			return nil, err
		}
		return item, nil
	}

	// 2. 更新已有记录（核验权限与内置防护）
	var existing model.CreativePromptTemplate
	if err := db.Where("id = ?", item.ID).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			item.CreatedAt = now
			if err := db.Create(item).Error; err != nil {
				return nil, err
			}
			return item, nil
		}
		return nil, err
	}

	// 严禁普通用户覆盖修改系统内置模板
	if existing.IsBuiltin {
		return nil, errors.New("系统内置模板不允许被覆盖修改，请另存为自定义新模板")
	}
	// 严禁越权修改他人模板（IDOR 漏洞防线）
	if existing.UserID != userID {
		return nil, errors.New("无权修改其他用户的提示词模板")
	}

	updates := map[string]interface{}{
		"name":       item.Name,
		"content":    item.Content,
		"kind":       item.Kind,
		"category":   item.Category,
		"tags":       item.Tags,
		"updated_at": now,
	}
	if err := db.Model(&model.CreativePromptTemplate{}).Where("id = ? AND user_id = ?", item.ID, userID).Updates(updates).Error; err != nil {
		return nil, err
	}
	item.CreatedAt = existing.CreatedAt
	item.UserID = existing.UserID
	item.IsBuiltin = false
	return item, nil
}

// DeleteTemplate 删除提示词模板（严格限制仅可删除属于自己的非内置模板）
func DeleteTemplate(db *gorm.DB, userID string, id string) error {
	trimmedID := strings.TrimSpace(id)
	if trimmedID == "" {
		return errors.New("模板 ID 不能为空")
	}
	if strings.TrimSpace(userID) == "" {
		return errors.New("用户未登录或无权删除")
	}

	var existing model.CreativePromptTemplate
	if err := db.Where("id = ?", trimmedID).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("模板不存在")
		}
		return err
	}

	if existing.IsBuiltin {
		return errors.New("系统内置模板不允许删除")
	}
	if existing.UserID != userID {
		return errors.New("无权删除其他用户的提示词模板")
	}

	return db.Where("id = ? AND user_id = ?", trimmedID, userID).Delete(&model.CreativePromptTemplate{}).Error
}
