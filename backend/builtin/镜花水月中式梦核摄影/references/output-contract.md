# 输出契约与可选审计

## 面向用户

每张先给中文标题和一两句构图意图，然后按顺序给两条英文 MJ 代码块与各自参考备注，最后给一个中文 ImageGen 代码块。限制词写进相应提示词；教学拆解与实际可复制文字分开。示例是新写的测试提示词，不是恢复出的原始提示词。

风格迁移保留的是视觉关系。无需强行输出 JSON；用户只要一条短提示词时尊重长度和平台限制。用户未限制时，宁可完整描述一个有关系的画面，也不要列出几百个形容词。

## JSON 批量审计

需要文件交付或验证时，用 `references/examples.json` 的结构。根为 `schema_version: 1` 和 `cases` 数组。每个 case 包含：

- `id`、`title`、`idea`、`ratio`、`intent`（中文共享画面意图）。
- `anchors_en`、`anchors_zh`：两到五个简短、实质性的主体/动作/位置锚点，分别必须出现在对应提示词。它们只是漏写检查，不是语义质量证明。
- `reference_setup`：`attach_to_prompt`、`style_reference`、`image_prompt` 各为对象，含 `mode: ui | url | none`、`assets: []`。Style reference 还允许 code 模式。ui 的 assets 是已知或建议的本地资产标签，不假装已上传；url/code 必须用户真实提供。
- `moodboard`：`mode: ui | code`，`code` 为真实值或 null；`source: user_supplied | user_existing_board | setup_required`。未知的板不可造代码。
- `mj_with_moodboard` / `mj_without_moodboard` 各含 `prompt`、`setup_note`、`reference_setup`。默认引用配置相同；用户明确要求差异时单独改场景配置而不是把它描述为纯 A/B 对照。
- `imagegen` 含 `prompt`（中文含限制）；`validation_level: prompt_only`，生成测试记录放外部验收报告，不改成自动视觉验证。

参考素材可选。如果没有素材，两个 MJ 的两个图槽均写 none；有板输出的备注如实标注未来需选板，而非声称当前已经存在或已启用。代码值真实性最终依靠用户输入/工具证据，脚本不能替代账号验证。

执行：

```text
python -B scripts/validate_outputs.py references/examples.json
python -B scripts/test_contract.py
python -B scripts/validate_outputs.py references/examples.json --markdown output.md
```

脚本检查双版本存在与文字有区别、比例和最终版本参数、选定锚点、中文与 MJ 参数隔离、参考角色一致、Moodboard 参数限制、UI 备注与虚构占位。它不推断谁更美，不比较实际像素，不上传、不生成。输出 markdown 仅为本地文字格式化；不修改用户原始提示词。
