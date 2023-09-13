import fs from 'fs';

function loadScript(filename: string) {
	const src = fs.readFileSync(`./static/${filename}`).toString();
	return `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
}

export const generateP5Html = (sketch: string) => `
    <html>
    
    <head>
		<script src="${loadScript('audioworklet-polyfill.js')}"></script>
        <script src="${loadScript('p5.js')}"></script>
        <script src="${loadScript('p5.sound.min.js')}"></script>
        <script src="${loadScript('simplex-noise.min.js')}"></script>
        <script src="${loadScript('moarp5.js')}"></script>
        <script src="${loadScript('CCapture.all.min.js')}"></script>
    </head>
    
    <body style="margin: 0">
        <script>
        ${sketch}
        </script>
    </body>
    
    </html>`;

function isCanvasPopulated(canvas: HTMLCanvasElement) {
	const context = canvas.getContext('2d');
	const { width, height } = canvas;
	if (context) {
		const imageData = context.getImageData(0, 0, width, height);
		const { data } = imageData;
		const isPopulated = data.some((pixel) => pixel !== 0);
		if (isPopulated) {
			return true;
		}
	}
	const webGl = canvas.getContext('webgl');
	if (webGl) {
		const pixels = new Uint8Array(width * height * 4);
		webGl.readPixels(0, 0, width, height, webGl.RGBA, webGl.UNSIGNED_BYTE, pixels);
		return pixels.some((pixel) => pixel !== 0);
	}
}

export async function getPopulatedCanvasFromScript(script: string) {
	const p5Template = generateP5Html(script);
	const iframe = document.createElement('iframe');
	let canvas: HTMLCanvasElement | null = null;
	iframe.id = `p5js-iframe-${Date.now()}`;
	iframe.srcdoc = p5Template;
	iframe.style.position = 'fixed';
	iframe.style.top = '0px';
	iframe.style.left = '99vw';
	iframe.style.width = '1024px';
	iframe.style.height = '1024px';
	iframe.style.opacity = '0.1';
	document.body.appendChild(iframe);
	const iframeLoadPromise = new Promise<void>((resolve, reject) => {
		iframe.onload = () => {
			let tries = 0;
			let timeoutId: ReturnType<typeof setTimeout>;
			const timeoutFunc = () => {
				try {
					if (!iframe.contentDocument) { throw Error('can not access iframe document') }
					canvas = iframe.contentDocument.querySelector('canvas');
					if (canvas && isCanvasPopulated(canvas)) {
						clearTimeout(timeoutId);
						resolve();
					} else if (tries >= 10) {
						clearTimeout(timeoutId);
						reject('Ran out of tries');
					} else {
						tries++;
						timeoutId = setTimeout(timeoutFunc, tries * 1000);
					}
				} catch (e) {
					clearTimeout(timeoutId);
					reject(e);
				}
			};
			timeoutId = setTimeout(timeoutFunc, 200);
		};
	});
	try {
		await iframeLoadPromise;
		return { canvas, iframe };
	} catch (e) {
		console.error('[getPopulatedCanvasFromScript] error getting canvas from iframe');
		console.error(e);
		return { canvas: null, iframe };
	}
}
