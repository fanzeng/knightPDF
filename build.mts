import * as esbuild from "esbuild";
import { globPlugin } from "esbuild-plugin-glob";
import fs from "node:fs/promises";
import postcss, { Processor } from "postcss";
import cssnano from "cssnano";
import copy from "copy";
import * as sass from "sass";
import chalk from "chalk";
import figlet from "figlet";

type Css = {
	in: string;
	out: string;
};
type Assets = {
	src: string;
	dest: string;
};

const plugins: Processor[] = [];
const assets = [
	{ src: "app/assets/*", dest: "out/assets" },
	{ src: "app/*html", dest: "out" },
	{ src: "app/libs/**/**", dest: "out/libs" },
];
const production = process.env.NODE_ENV === "production";

console.log(chalk.blue(figlet.textSync("NightPDF")));
console.log(chalk.blue("Building...."));

await fs.mkdir("out");
await fs.mkdir("out/css");

if (production) {
	plugins.push(
		cssnano({
			preset: [
				"advanced",
				{
					discardComments: {
						removeAll: true,
					},
					discardEmpty: true,
					normalizeUrl: true,
					autoprefixer: true,
				},
			],
		}),
	);
}

async function assemble(fn: Css): Promise<void> {
	const css = await sass.compileAsync(fn.in);
	const postcss_out = await postcss(plugins).process(css.css, {
		from: fn.in,
		to: fn.out,
	});
	fs.writeFile(fn.out, postcss_out.css);
	if (postcss_out.map) {
		fs.writeFile(`${fn.out}.map`, postcss_out.map.toString());
	}
}

async function copy_asset(fn: Assets): Promise<void> {
	copy(fn.src, fn.dest, function (err, files) {
		if (err) throw err;
	});
}

const files = [
	{ in: "app/css/index.scss", out: "out/css/index.css" },
	{ in: "app/css/settings.scss", out: "out/css/settings.css" },
];
const ts_dirs = ["helpers", "preload", "main", "render"];

ts_dirs.forEach((dir) => {
	if (dir === "render") {
		esbuild.build({
			entryPoints: ["app/render/*.ts"],
			outdir: "out/render",
			bundle: true,
			format: "esm",
			minify: production,
			plugins: [globPlugin()],
		});
	} else {
		esbuild.build({
			entryPoints: [`app/${dir}/*.ts`],
			outdir: `out/${dir}`,
			treeShaking: true,
			minify: production,
			format: "cjs",
			platform: "node",
			packages: "external",
			plugins: [globPlugin()],
		});
	}
});

files.forEach((pair) => {
	assemble(pair);
});

assets.forEach((asset) => {
	copy_asset(asset);
});

console.log(chalk.blue("Done...."));