import { Server, WebSocket } from 'ws';
// import { connect } from 'ngrok';
// import { App, launch } from 'carlo';
// import { resolve } from 'path';
import { Turtle } from './turtle';
import Queue from 'p-queue';
import World from './world';
// import { executablePath } from 'puppeteer-core';

const wss = new Server({host: "192.168.2.100", port: 57 });

// let app: App;
let turtles: { [id: number]: Turtle } = {};

const world = new World;
const queue = new Queue({ concurrency: 1 });
const turtleAddQueue = new Queue({ concurrency: 1 });
turtleAddQueue.pause();
let controlPanels: WebSocket[] = [];

var debug:number = -1

function setWorld(id?:number) {
	const payload = JSON.stringify({type:"setWorld",data:JSON.stringify(world.getAllBlocks())})
	if (typeof id === "undefined") {
		controlPanels.map((w) => {
			w.send(payload)
		})
		return
	}
	controlPanels[id].send(payload)
}

function setTurtles(id?:number) {
	const payload = JSON.stringify({type:"setTurtles",data:serializeTurtles()})
	if (typeof id === "undefined") {
		controlPanels.map((w) => {
			w.send(payload)
		})
		return
	}
	controlPanels[id].send(payload)
}

async function exec(index: number, func: string, ...args: string[] | number[]): Promise<any> {
	debug += 1
	
	if (turtles[index].working === true) {
		let fakeP = new Promise<any>((resolve, reject) => {
			console.log("CUM")
			reject();
			console.log("test")
		})
		console.log("exec failed "+ debug)
		return fakeP
	}
	console.log("exec "+ debug)
	if (typeof index === 'string') {
		[index, func, ...args] = JSON.parse(index).args;
	}
	console.log(func)
	let r = await queue.add(() => ((turtles[index] as any)[func])(...args));
	
	
	return r
};

(async () => {
	world.on('update', async (world) => {
		await controlPanels.map((ws) => {
			ws.send(JSON.stringify({type:"setWorld",data:JSON.stringify(world)}))
		}) 
	});
	turtleAddQueue.start();
})();
wss.on('connection', async function connection(ws) {
	console.log("connec")
	ws.on('message',async (e) => {
		let j = JSON.parse(e.toString())
		if (j.type === "init") {
			if (j.data === "turtle") {
				await turtleAddQueue.add(() => {
					let turtle = new Turtle(ws, world);
					// console.log(turtle)
					turtle.on('init', async () => {
						console.log("turtle")
						turtles[turtle.id] = turtle;
						turtle.on('update', () => setTurtles());
						setTurtles();
						setWorld();
						ws.on('close', async () => {
							delete turtles[turtle.id];
							setTurtles()
						});
					});
				});
			}

			if (j.data ==="control") {
				console.log("WOWIE")
				controlPanels.push(ws)
				setTurtles();
				setWorld();
			}
			
		}

		if (j.dataType === "refreshData") {
			// const index = controlPanels.findIndex((w) => (w === ws));
			setTurtles();
			setWorld();
		}
		if (j.dataType === "exec") {
			// const cpIndex = controlPanels.findIndex((w) => (w === ws));
			let js = JSON.parse(j.data)
			exec(js.index,js.code,...js.args).then((rv) => {
				ws.send(JSON.stringify({type:"exec",data:rv, Pindex:js.Pindex}))
			}).catch(() => {
				ws.send(JSON.stringify({type:"deleteCMD", Pindex:js.Pindex}))
			})
			
		}
	})
	// console.log(wss.clients)
});

function serializeTurtles() {
	return JSON.stringify(Object.values(turtles));
}