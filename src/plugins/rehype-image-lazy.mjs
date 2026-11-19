import { visit } from "unist-util-visit";

/**
 * 为文章正文里的裸 <img>（不经过 ImageWrapper.astro 的）添加
 * loading="lazy" + decoding="async"，减少首屏加载量。
 * 已有 loading 属性的不动（比如首图需要 eager 的场景）。
 */
export default function rehypeImageLazy() {
	return (tree) => {
		visit(tree, "element", (node) => {
			if (node.tagName !== "img") return;
			if (node.properties?.loading) return;
			node.properties.loading = "lazy";
			node.properties.decoding = "async";
		});
	};
}
