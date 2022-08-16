import * as fs from "fs";
import {TypedStreamReader} from "./stream";
import {Unarchiver} from "./archiver";
import {inspect} from "util";

const inp = fs.readFileSync("/Users/elliot/Desktop/abpayload.bin");

const ts = new TypedStreamReader(inp);

for (const obj of ts) {
    if (Symbol.iterator in Object(obj)) {
        // @ts-ignore
        // for (const test of obj) {
        //     console.log(test);
        //     console.log("did this");
        // }
        console.log(obj);
    } else {
        console.log(obj);
    }
}

// const unarchiver = new Unarchiver(ts);
//
// const test = unarchiver.decodeAll();
