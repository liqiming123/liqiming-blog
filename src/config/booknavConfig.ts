import booknavData from "@/data/booknav.json";
import type { BooknavGroup, BooknavPageConfig } from "../types/booknavConfig";

// 书签导航页面配置
export const booknavPageConfig: BooknavPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// favicon 自动获取配置
	favicon: {
		// 书签未填写 icon 时，是否自动获取目标站点的 favicon 图标
		enabled: true,

		// favicon 接口地址，{domain} 为占位符，会被替换成目标站点域名
		// 更换接口只需保证地址里含有 {domain}，例如：
		//   https://a.favicon.im/{domain}
		//   https://favicon.im/{domain}
		api: "https://a.favicon.im/{domain}",
	},
};

// 书签导航数据：已迁移到 src/data/booknav.json（ADR-7 结构化配置 JSON 化），
// 本文件只是薄导入层保持既有 import 路径不变。
// 管理后台「书签导航」页面读写同一份 JSON，保存后自动触发构建上线；
// 手动编辑也直接改 JSON：每个数组项是一个分类组，组内 items 为该书签分类下的站点。
export const booknavConfig = booknavData as BooknavGroup[];
