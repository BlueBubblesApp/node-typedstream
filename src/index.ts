import * as fs from "fs";
import {TypedStreamReader} from "./stream";
import {TypedValue, Unarchiver} from "./archiver";
import {NSString} from "./types/foundation";

const inp = fs.readFileSync("/Users/elliot/Desktop/abpayload.bin");

const ts = new TypedStreamReader(inp);
const unarchiver = new Unarchiver(ts);

const test = unarchiver.decodeAll()[0].values[0];

console.log(JSON.stringify(test, null, 2));
