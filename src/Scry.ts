import { EventEmitter } from "events";
import * as request from "request-promise";

export * from "./IScry";
import { Card, CardSymbol, HomepageLink, List, ManaCost, Ruling, SearchOptions, Set } from "./IScry";


// the path to the api
const endpoint = "https://api.scryfall.com";
// the api requests 50-100 ms between calls, we go on the generous side and never wait less than 100 ms between calls
const rateLimit = 100;



let lastQuery = 0;

function sleep (ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryApi<T> (apiPath: string | number | (string | number)[], query?: { [key: string]: any }) {
	if (Array.isArray(apiPath)) {
		apiPath = apiPath.join("/");
	}

	const now = Date.now();
	const timeSinceLastQuery = now - lastQuery;
	if (timeSinceLastQuery >= rateLimit) {
		lastQuery = now;

	} else {
		const timeUntilNextQuery = rateLimit - timeSinceLastQuery;
		lastQuery += timeUntilNextQuery;
		await sleep(timeUntilNextQuery);
	}

	const result = await request({
		json: true,
		qs: query,
		uri: `${endpoint}/${apiPath}`,
	}).catch(() => { }) as any as Promise<T>;

	return result || { data: [] } as any;
}

export class MagicEmitter<T> extends EventEmitter {
	private _ended = false;
	public get ended () {
		return this._ended;
	}

	private _cancelled = false;
	public get cancelled () {
		return this._cancelled;
	}

	public constructor() {
		super();
		this.on("end", () => {
			this._ended = true;
		});
		this.on("cancel", () => {
			this._ended = true;
		});
	}

	public on (event: "data", listener: (data: T) => any): this;
	public on (event: "end", listener: () => any): this;
	public on (event: "cancel", listener: () => any): this;
	public on (event: "error", listener: (err: Error) => any): this;
	public on (event: string, listener: (...args: any[]) => any) {
		super.on(event, listener);
		return this;
	}

	public emit (event: "data", data: T): boolean;
	public emit (event: "end"): boolean;
	public emit (event: "cancel"): boolean;
	public emit (event: "error", error: Error): boolean;
	public emit (event: string, ...data: any[]) {
		return super.emit(event, ...data);
	}

	public cancel () {
		this._cancelled = true;
		this.emit("cancel");
	}

	public async waitForAll () {
		return new Promise<T[]>((resolve, reject) => {
			const results: T[] = [];
			this.on("data", result => {
				results.push(result);
			});
			this.on("end", () => resolve(results));
			this.on("error", reject);
		});
	}

	public async *[Symbol.asyncIterator] () {
		const unyielded: T[] = [];
		this.on("data", data => unyielded.push(data));
		while (!this._ended) {
			await new Promise(resolve => this.on("data", resolve));
			let data: T | undefined;
			while (data = unyielded.shift()) {
				yield data;
			}
		}
	}

	public all () {
		return this[Symbol.asyncIterator]();
	}
}

export module Cards {
	export async function byName (name: string, fuzzy = false) {
		return queryApi<Card>("cards/named", {
			[fuzzy ? "fuzzy" : "exact"]: name,
		});
	}

	export async function byId (id: string) {
		return queryApi<Card>(["cards", id]);
	}

	export async function bySet (setCode: string, collectorNumber: string) {
		return queryApi<Card>(["cards", setCode, collectorNumber]);
	}

	export async function byMultiverseId (id: number) {
		return queryApi<Card>(["cards/multiverse", id]);
	}

	export async function byMtgoId (id: number) {
		return queryApi<Card>(["cards/mtgo", id]);
	}

	export async function random () {
		return queryApi<Card>("cards/random");
	}

	async function getPage<T> (emitter: MagicEmitter<T>, apiPath: string, query: any, page = 1) {
		const results = await queryApi<List<T>>(apiPath, { ...query, page });
		for (const card of results.data) {
			emitter.emit("data", card);
		}

		if (results.has_more) {
			if (!emitter.cancelled) {
				getPage(emitter, apiPath, query, page + 1).catch(err => emitter.emit("error", err));
			}

		} else {
			emitter.emit("end");
		}
	}

	export function search (query: string, options?: SearchOptions) {
		const emitter = new MagicEmitter<Card>();

		getPage(emitter, "cards/search", { q: query, ...options }).catch(err => emitter.emit("error", err));

		return emitter;
	}

	export function all () {
		const emitter = new MagicEmitter<Card>();

		getPage(emitter, "cards", {}).catch(err => emitter.emit("error", err));

		return emitter;
	}

	export async function autoCompleteName (name: string) {
		return (await queryApi<ApiCatalog>("cards/autocomplete", { q: name })).data;
	}
}

export module Sets {
	export async function all () {
		return (await queryApi<List<Set>>("sets")).data;
	}

	export async function byCode (code: string) {
		return queryApi<Set>(["sets", code]);
	}
}

export module Symbology {
	export async function all () {
		return (await queryApi<List<CardSymbol>>("symbology")).data;
	}

	export async function parseMana (shorthand: string) {
		return queryApi<ManaCost>("symbology/parse-mana", { cost: shorthand });
	}
}


interface ApiCatalog {
	data: string[];
}
export module Catalog {
	export async function cardNames () {
		return (await queryApi<ApiCatalog>("catalog/card-names")).data;
	}
	
	export async function artistNames () {
		return (await queryApi<ApiCatalog>("catalog/artist-names")).data;
	}

	export async function wordBank () {
		return (await queryApi<ApiCatalog>("catalog/word-bank")).data;
	}

	export async function creatureTypes () {
		return (await queryApi<ApiCatalog>("catalog/creature-types")).data;
	}

	export async function planeswalkerTypes () {
		return (await queryApi<ApiCatalog>("catalog/planeswalker-types")).data;
	}

	export async function landTypes () {
		return (await queryApi<ApiCatalog>("catalog/land-types")).data;
	}

	export async function artifactTypes () {
		return (await queryApi<ApiCatalog>("catalog/artifact-types")).data;
	}

	export async function enchantmentTypes () {
		return (await queryApi<ApiCatalog>("catalog/enchantment-types")).data;
	}

	export async function spellTypes () {
		return (await queryApi<ApiCatalog>("catalog/spell-types")).data;
	}

	export async function powers () {
		return (await queryApi<ApiCatalog>("catalog/powers")).data;
	}

	export async function toughnesses () {
		return (await queryApi<ApiCatalog>("catalog/toughnesses")).data;
	}

	export async function loyalties () {
		return (await queryApi<ApiCatalog>("catalog/loyalties")).data;
	}

	export async function watermarks () {
		return (await queryApi<ApiCatalog>("catalog/watermarks")).data;
	}
}

export async function homepageLinks () {
	return (await queryApi<List<HomepageLink>>("homepage-links")).data;
}

export module Rulings {

	export async function byId (id: string) {
		return (await queryApi<List<Ruling>>(["cards", id, "rulings"])).data;
	}

	export async function bySet (setCode: string, collectorNumber: string) {
		return (await queryApi<List<Ruling>>(["cards", setCode, collectorNumber, "rulings"])).data;
	}

	export async function byMultiverseId (id: number) {
		return (await queryApi<List<Ruling>>(["cards/multiverse", id, "rulings"])).data;
	}

	export async function byMtgoId (id: number) {
		return (await queryApi<List<Ruling>>(["cards/mtgo", id, "rulings"])).data;
	}
}
