import * as fs from "fs";
import {Unarchiver} from "./archiver";

const input = fs.readFileSync("/Users/elliot/Desktop/abpayload.bin");

const unarchiver = Unarchiver.open(input);

console.log(unarchiver.decodeSingleRoot());
