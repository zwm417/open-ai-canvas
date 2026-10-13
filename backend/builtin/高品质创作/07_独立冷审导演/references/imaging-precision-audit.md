# Imaging Precision Audit｜最高品质成像精度审计

## 核心Finding

IMAGING_PRECISION_UNDERSPECIFIED / HERO_DETAIL_PRIORITY_LOSS / MATERIAL_RESPONSE_FLATTENING / VFX_INTERNAL_RESOLUTION_COLLAPSE / RADIOMETRIC_INTEGRATION_FAIL / TEMPORAL_IMAGING_DRIFT / MULTISCALE_DETAIL_MISMATCH / GLOBAL_MICRODETAIL_NOISE / MOTION_CLARITY_ROLE_CONFLICT / PRECISION_COMPRESSION_LOSS。

## 审计顺序

1. 先确认当前镜头真正的Precision ROI与景别责任。
2. 找第一处导致完成态降档的可见缺口。
3. 区分“正确的非Hero模糊/简化”与“关键精度丢失”。
4. 检查同一材质/VFX/曝光跨时间是否保持身份。
5. 检查VFX亮度是否真实进入人物、空气和环境材质。
6. 检查06是否为了简洁误删受保护成像事实。
7. 修复只改首个偏差及直接后果，不推翻已成功的角色、动作、空间和摄影。

## Camera Model Findings

额外检查：CAMERA_MODEL_MISSING / CAMERA_PRIOR_NO_VISIBLE_RESULT / CAMERA_MODEL_DRIFT。用户未明确要求省略时，最终生成Prompt缺具体型号即不通过。
