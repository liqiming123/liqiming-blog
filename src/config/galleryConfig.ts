import galleryData from "@/data/gallery.json";
import type { GalleryConfig } from "@/types/galleryConfig";

// 相册配置：数据已迁移到 src/data/gallery.json（ADR-7 结构化配置 JSON 化），
// 由 Admin 管理台读写；本文件保留为类型化导入层，前台消费方不受影响。
//
// 手动添加相册时直接编辑 src/data/gallery.json 的 albums 数组：
// 支持jpg/png/webp/avif/gif格式
// id: 相册唯一标识符（用于目录命名和URL路径），比如设置：id: "firefly-2026", 对应 public/gallery/firefly-2026/目录
// cover: 手动指定封面图（可选，不填会把cover.*文件作为封面图，如果没有cover.*文件，则使用第一张图片作为封面图）
// name/description/location/date(YYYY-MM-DD 排序用)/tags 照常填写
// password/passwordHint: 加密相册（可选）
// 每添加一个数组项就相当于添加了一个相册，记得在 public/gallery/ 目录下创建对应的子目录并放入图片
export const galleryConfig: GalleryConfig = galleryData as GalleryConfig;
