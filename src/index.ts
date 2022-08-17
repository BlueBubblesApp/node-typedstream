import * as fs from "fs";
import {TypedStreamReader} from "./stream";
import {Unarchiver} from "./archiver";
import {inspect} from "util";

const inp = fs.readFileSync("/Users/elliot/Desktop/abpayload.bin");

const ts = new TypedStreamReader(inp);

let i = 0;
const testArr = [];
for (const obj of ts) {
    console.log(i++);
    console.log(obj);
    testArr.push(obj);
}

console.log("\nDONE WITH PROCESSING, PRINTING RESULT\n\n");
for (const obj of testArr) {
    console.log(obj);
}

// const unarchiver = new Unarchiver(ts);
//
// const test = unarchiver.decodeAll();
