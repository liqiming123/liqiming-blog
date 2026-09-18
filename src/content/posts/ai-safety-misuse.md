---
title: "从真实滥用案例看 AI 系统的安全边界"
published: 2026-09-10
description: "Anthropic 发布 2026 年 9 月威胁情报报告，展示模型被用于网络、影响、监控和数据蒸馏等活动时的防御重点。"
tags: [AI 安全, 智能体, 威胁情报, 治理]
category: "AI 安全"
slug: ai-safety-misuse
sourceLink: "https://www.anthropic.com/threat-intelligence-report-september-2026"
licenseName: "原始来源"
licenseUrl: "https://www.anthropic.com/threat-intelligence-report-september-2026"
---

Anthropic 在 2026 年 9 月发布了新的威胁情报报告，回顾 2025 年 12 月至 2026 年 8 月期间识别和中断的多类 Claude 滥用活动，范围包括网络攻击、影响行动、监控、诈骗、生物风险和未经授权的能力蒸馏。

## 安全问题已经从“回答什么”变成“能完成什么”

当模型可以调用工具、编写代码、访问浏览器和连续运行时，风险不再只来自一条危险回答。攻击者可能把多个普通能力串成完整流程：收集数据、建立账号、生成内容、运行脚本，再通过自动化扩大规模。

因此，安全控制不能只放在提示词里，至少还需要：

- **身份与权限**：为高风险工具绑定最小权限和短时令牌。
- **行为监测**：观察工具调用序列、访问频率和异常资源使用，而不是只检查文本。
- **可撤销性**：让账号封禁、任务停止和密钥轮换可以快速执行。
- **跨组织协作**：在不泄露用户隐私的前提下，共享指标和攻击特征。

报告还提醒开发者，未经授权的模型蒸馏会把敏感数据和高能力输出一起带出系统。生产环境应该明确数据保留、日志访问和第三方路由边界，尤其不要把 API 密钥、内部文档或个人数据直接交给不受控的代理链路。

安全不是发布前的一次审核，而是贯穿模型、工具、账号和基础设施的持续反馈回路。

原始来源：[Detecting and countering misuse of AI: September 2026](https://www.anthropic.com/threat-intelligence-report-september-2026)。
