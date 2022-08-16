import {archivedClass, KnownArchivedObject} from "../archiver.js";

@archivedClass("NSString")
export class NSString extends KnownArchivedObject {
    value: string;
    constructor(value?: string) {
        super();
        this.value = value!;
    }
}
