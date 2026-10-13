# 智影视听导演 Toolkit Routing Contract｜公共意图锁与条件路由合同

版本：v12.0.0-rc13.3.1

本合同只负责**完整10 Skill工具包中的发现、主权与交接**。它不新增第11个 Skill，不把工具包变成固定流水线，也不改变任何专业 Skill 的方法论主权。

## 1. Public Intent Lock｜每个任务先锁真实交付目标与核心专业难点

在完整工具包可用时，先判断两件事：

1. **Delivery Goal**：用户最终要故事/剧本、资产/图片、表演、镜头、动作/VFX、最终视频Prompt、原创概念、独立冷审、生成前预检，还是深度战斗设计？
2. **Core Professional Problem**：本轮最需要被“创造/裁决”的专业事实是什么？

路由以第二项决定`Primary Skill`，不能仅凭最终文件格式或用户句子里出现“Prompt/镜头/特效”等单词抢主权。

## 2. Exactly One Primary Skill｜唯一主 Skill

每个任务先裁决**唯一一个Primary Skill**。Primary负责本轮最重要的专业判断；其他相关 Skill 只能作为Collaborator、Finalizer或Validator参与。

- 01：故事、剧本、人物关系、世界观、完整项目方向与叙事裁决；
- 02：静态视觉、美学、角色/场景/道具/服化资产与图片；
- 03：文戏、潜台词、表演、对白、口型、倾听反应；
- 04：已有内容/动作基础上的Blocking、摄影、机位、剪辑、声音与观看证明；
- 05：已有战斗意图/编排基础上的动作可执行性、物理、接触、VFX与环境反馈；
- 06：**内容事实已经锁定**后的最终视频Prompt编译、模型适配、格式/参考职责/冲突清理与最小补丁；
- 07：独立语义/专业/连续性/成片冷审；
- 08：当“原创突破本身”是第一诉求时的高熵创意搜索与原创裁决；
- 09：**准备生成前**的可行性、冲突、素材、时长、模型风险与重试Preflight；
- 10：从零或需要重新设计的高复杂度战斗、战斗人格、对位、阶段、大招、群战/Boss、Combat–VFX与战斗奇观。

## 3. Four Routing Roles｜四种角色不要混

- **Primary**：唯一一个，生产本轮核心专业事实。
- **Collaborator**：0—多个，只补Primary缺少的专业判断，不抢主权。
- **Finalizer**：当用户要生成型最终视频Prompt且06可用时，固定由06统一收口；Finalizer身份**不等于Primary**。
- **Validator**：07与09按任务性质使用。07审“作品/Prompt是否真正成立”，09审“现在是否适合拿去生成以及哪里可能崩”。

## 4. No Global Pipeline, Conditional Mandatory Edges｜没有全局流水线，但有条件必经边

工具包**不存在所有任务都必须按01→02→…→10执行的固定流水线**；但条件成立时，下列交接不是可选顺序：

- 从零高复杂度打斗且10可用：`10 Primary → 05/04按需Collaborator → 06 Finalizer（若要最终视频Prompt） → 09 Preflight`。
- 内容/动作已经锁定，只修动作物理/VFX：`05 Primary → 04按需 → 06（若要最终Prompt） → 09`。
- 内容/动作已经锁定，只修镜头/剪辑/声音：`04 Primary → 06（若要最终Prompt） → 09`。
- 文戏/对白表演是核心：`03 Primary → 04按需 → 06（若要最终Prompt） → 09`。
- 完整故事/项目：`01 Primary → 02/03/04/05/08/10按缺口协作 → 06只负责视频Prompt收口`。
- 原创突破优先：`08 Primary`；若创意核是复杂战斗，10作为战斗协作；若用户已有创意核、真正要解决“怎么打”，则`10 Primary`而非08。
- 最终生成型视频Prompt：06完成后，09可用时进入Generation Preflight；如果用户同时明确要求独立专业冷审，再由07单独审。

## 5. Combat Disambiguation｜05与10的硬消歧

以下情况即使用户只说“写10秒高燃仙侠打斗提示词”，没有显式说“战斗设计”，只要需要从零决定战法、对位、阶段、奇观或能力如何参与攻防，**10就是Primary**。

只有当战法/编排已经明确，用户要求的是发力、接触、受力、物理、VFX实体化、环境反馈或窄修复，05才是Primary。

## 6. Compiler Disambiguation｜06不是因为“最终要Prompt”就自动成为Primary

- “把这份已经完整的分镜/设计转成Seedance 2.5 Prompt，不改内容” → 06 Primary。
- “从零写一场高燃打斗Prompt” → 10 Primary，06 Finalizer。
- “写一段两人压抑争执Prompt” → 03 Primary，06 Finalizer。
- “设计一个完整故事并出视频Prompt” → 01 Primary，06只收口视频生成语言。

## 7. Audit Disambiguation｜07与09

- “全面冷审/专业审查/这个成片到底有没有兑现/逻辑是否成立” → 07 Primary。
- “马上生成前看看会不会崩/素材齐不齐/时长过载吗/模型能做吗/怎么拆段” → 09 Primary。
- 09不得替代07的独立作品审查；07也不替代09的模型生成前风险门。

## 8. Standalone Fallback｜单独安装能力保留

当某专业 Skill 单独安装、或完整工具包中的对应专项 Skill真实不可用时，该 Skill继续使用模型自身知识完成必要跨域工作。`Standalone Fallback`只保证独立可用，不改变完整工具包环境中的Primary/Finalizer/Validator主权。

## 9. Evidence Boundary

本路由合同与随包静态Routing Regression验证的是**包内发现语义和路由规则自洽**，不冒充智影/WorkBuddy/其他宿主具体版本的真实发现器E1行为。宿主真实调用记录出现后，应继续用Observed Routing Evidence升级规则。
