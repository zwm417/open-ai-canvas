# VFX Internal Resolution + Radiometric + Temporal Fidelity

## VFX Internal Resolution Stack

对主VFX按需要启用：Core / Body / Surface / Edge / Secondary / Trail / Lighting / Residual。目标是让能力具有材料身份和内部层级，不是强迫每个特效堆满粒子。

## Radiometric Integration

事件光必须进入世界：VFX光源影响邻近Hero表面、烟雾/水体/碎屑、地面/建筑材质，并随距离、遮挡和生命周期衰减。曝光响应保护主体细节，避免白闪烧毁核心动作。

## Temporal Fidelity

同一能力在生命周期内保持材料家族、Core/Body关系、综合色、亮度层级、Anchor、传播方式、Trail方向和Residual连续。合法变化来自充能、命中、混合、破坏、环境介质、阶段升级或衰减。

## 高速边界

高速可以拉长Trail、压扁流体、产生方向性粒子拉伸，但不能把实体实例变成随机光线，不能让水/冰/雾/火/雷在不同镜头无因互换材料身份。
