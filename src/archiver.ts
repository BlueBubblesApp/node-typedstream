import {
    Atom, BeginArray,
    BeginObject, BeginStruct,
    BeginTypedValues, ByteArray,
    CString, EndArray, EndObject, EndStruct, EndTypedValues,
    ObjectReference, ReadEvent,
    Selector,
    SingleClass,
    TypedStreamReader
} from "./stream";
import {AssertionError} from "assert";
import {buildStructEncoding, parseArrayEncoding, parseStructEncoding} from "./encodings";

export class TypedGroup {
    encodings: Array<string>;
    values: Array<any>;
    constructor(encodings: Array<string>, values: Array<any>) {
        this.encodings = encodings;
        this.values = values;
    }
}

export class TypedValue extends TypedGroup {
    get encoding(): string {
        return this.encodings[0];
    }
    get value(): any {
        return this.values[0];
    }
    constructor(encoding: string, value: any) {
        super([encoding], [value]);
    }
}

export class CArray {
    elements: Array<any>;
    constructor(elements: Array<any>) {
        this.elements = elements;
        const test = TypedValue;
    }
}

export class CClass {
    name: string;
    version: number;
    superclass?: any;
    constructor(name: string, version: number, superclass?: any) {
        this.name = name;
        this.version = version;
        this.superclass = superclass;
    }
}

export class GenericArchivedObject {
    clazz: CClass;
    contents: TypedGroup[];
    constructor(clazz: CClass, contents: TypedGroup[]) {
        this.clazz = clazz;
        this.contents = contents;
    }
}

export abstract class KnownArchivedObject {
    static archivedName: string;
    static initFromUnarchiver(unarchiver: Unarchiver, archivedClass: CClass): KnownArchivedObject {
        throw new Error("Method not implemented");
    };
}

type KnownArchivedObjectDerived = {new (): KnownArchivedObject} & typeof KnownArchivedObject;
const archivedClassesByName = new Map<string, KnownArchivedObjectDerived>();

export function archivedClass(archivedName: string) {
    return (target: KnownArchivedObjectDerived) => {
        target.archivedName = archivedName;
        archivedClassesByName.set(archivedName, target);
    }
}

class GenericStruct {
    name?: string;
    fields: any[];
    constructor(fields: any[], name?: string) {
        this.name = name;
        this.fields = fields;
    }
}

abstract class KnownStruct {
    static structName: string;
    static fieldEncodings: string[];
    static encoding: string;
    protected constructor(fields: any[]) {}
}

type KnownStructDerived = {new (fields: any[]): KnownStruct} & typeof KnownStruct;
const structClassesByEncoding = new Map<string, KnownStructDerived>();

function structClass(structName: string, fieldEncodings: string[]) {
    return (target: KnownStructDerived) => {
        target.structName = structName;
        target.fieldEncodings = fieldEncodings;
        target.encoding = buildStructEncoding(fieldEncodings, structName);
        structClassesByEncoding.set(target.encoding, target);
    }
}

class NO_LOOKAHEAD {}

export class Unarchiver {
    reader: TypedStreamReader
    private lookahead: any;
    private sharedObjectTable: Array<[ObjectReference.Type, any]> = [];

    constructor(reader: TypedStreamReader) {
        this.reader = reader;
    }

    private lookupReference(ref: ObjectReference) {
        const [refType, obj] = this.sharedObjectTable[ref.number];
        if (ref.referencedType != refType) {
            throw new EvalError(`Object reference type mismatch: reference should point to an object of type ${ref.referencedType}`);
        }
        return obj;
    }

    decodeAnyUntypedValue(expectedEncoding: string): any {
        const first = this.reader.next().value;

        if (first == null || (typeof first in ["number", "string"])) {
            return first;
        } else if (first instanceof ObjectReference) {
            return this.lookupReference(first);
        } else if (first instanceof CString) {
            this.sharedObjectTable.push([ObjectReference.Type.C_STRING, first.contents]);
            return first.contents;
        } else if (first instanceof Atom) {
            return first.contents;
        } else if (first instanceof Selector) {
            return first.name;
        } else if (first instanceof SingleClass) {
            // Read the superclass chain until (and including) the terminating Nil or reference.
            const singleClasses = [first];
            let nextClassEvent = this.reader.next().value;
            while (nextClassEvent != undefined && !(nextClassEvent instanceof ObjectReference)) {
                if (!(nextClassEvent instanceof SingleClass)) {
                    throw new EvalError(`Expected SingleClass, ObjectReference, or undefined, not ${typeof nextClassEvent}`);
                }
                singleClasses.push(nextClassEvent);
                nextClassEvent = this.reader.next().value;
            }

            // Resolve the possibly Nil superclass of the last literally stored class.
            const terminatingEvent = nextClassEvent;
            let nextSuperclass;
            if (terminatingEvent == null) {
                nextSuperclass = undefined;
            } else if (terminatingEvent instanceof ObjectReference) {
                nextSuperclass = this.lookupReference(terminatingEvent);
            } else {
                throw new AssertionError();
            }

            // Convert the SingleClass events from the stream into Class objects with a superclass.
            // (The terminating Nil or reference is not included in this list,
            // so that it doesn't get an object number assigned.)
            // This list is built up backwards,
            // because of how the SingleClass objects are stored in the stream -
            // each class is stored *before* its superclass,
            // but each Class object can only be constructed *after* its superclass Class has been constructed/looked up.
            // So we iterate over the SingleClass events in reverse order,
            // and store the Class objects in reverse order of construction,
            // so that in the end new_classes matches the order stored in the stream.
            const newClasses: CClass[] = [];
            for (const singleClass of singleClasses.reverse()) {
                nextSuperclass = new CClass(singleClass.name, singleClass.version, nextSuperclass);
                newClasses.splice(0, 0, nextSuperclass);
            }

            // Object numbers for classes are assigned in the same order as they are stored in the stream.
            for (const newClass of newClasses) {
                this.sharedObjectTable.push([ObjectReference.Type.CLASS, newClass]);
            }

            return nextSuperclass;
        } else if (first instanceof BeginObject) {
            // The object's number is assigned *before* its class information is read,
            // but at this point we can't create the object yet
            // (because we don't know its class),
            // so insert a placeholder value for now.
            // This placeholder value is only used to make object number assignments happen in the right order.
            // It's never used when actually looking up a reference,
            // because it's replaced immediately after the class information is fully read,
            // and the class information can only contain references to other classes and not objects.
            const placeholderIndex = this.sharedObjectTable.length;
            this.sharedObjectTable.push([ObjectReference.Type.OBJECT, undefined]);

            const archivedClass = this.decodeAnyUntypedValue("#");
            if (!(archivedClass instanceof CClass)) {
                throw new EvalError(`Object class must be a CClass, not ${typeof archivedClass}`);
            }

            // Create the object.
            // Try to look up a known custom Python class for the archived class and create an instance of it.
            // If no custom class is known for the archived class,
            // create a generic object instead.

            const obj: GenericArchivedObject | KnownArchivedObject =
                archivedClassesByName.get(archivedClass.name)?.initFromUnarchiver(this, archivedClass)
                ?? new GenericArchivedObject(archivedClass, []);

            // Now that the object is created,
            // replace the placeholder in the shared object table with the real object.
            this.sharedObjectTable[placeholderIndex] = [ObjectReference.Type.OBJECT, obj];

            console.log(obj);
            if (obj instanceof GenericArchivedObject) {
                let nextEvent = this.reader.next().value;
                while (!(nextEvent instanceof EndObject)) {
                    obj.contents.push(this.decodeTypedValues(nextEvent));
                    nextEvent = this.reader.next().value;
                }
            } else {
                const end = this.reader.next().value;
                if (!(end instanceof EndObject)) {
                    throw new EvalError(`Expected EndObject, not ${typeof end}`);
                }
            }

            return obj;
        } else if (first instanceof ByteArray) {
            return new CArray([...first.data]);
        } else if (first instanceof BeginArray) {
            const expectedElementEncoding = parseArrayEncoding(expectedEncoding).elementTypeEncoding;
            // I really want a more idiomatic way to do this
            const decodedArray = [];
            for (let i = 0; i < first.length; i++) {
                decodedArray.push(this.decodeAnyUntypedValue(expectedElementEncoding));
            }
            const array: CArray = new CArray(decodedArray);

            const end = this.reader.next().value;
            if (!(end instanceof EndArray)) {
                throw new EvalError(`Expected EndArray, not ${typeof end}`);
            }

            return array;
        } else if (first instanceof BeginStruct) {
            const nodeStructClass = structClassesByEncoding.get(expectedEncoding);
            const expectedFieldEncodings = nodeStructClass?.fieldEncodings
                ?? parseStructEncoding(expectedEncoding).fieldTypeEncodings;

            const fields = expectedFieldEncodings.map((e) => this.decodeAnyUntypedValue(e));

            const end = this.reader.next().value;
            if (!(end instanceof EndStruct)) {
                throw new EvalError(`Expected EndStreuct, not ${typeof end}`);
            }

            if (nodeStructClass == null) {
                return new GenericStruct(fields, first.name);
            } else {
                return new nodeStructClass(fields);
            }
        } else {
            throw new EvalError(`Unexpected event at beginning of untyped value: ${typeof first}`);
        }
    }

    decodeTypedValues(lookahead: any = NO_LOOKAHEAD) {
        const begin = lookahead == NO_LOOKAHEAD ? this.reader.next().value : lookahead;

        if (!(begin instanceof BeginTypedValues)) {
            throw new EvalError(`Expected BeginTypeValues, not ${typeof begin}`);
        }

        // Single typed values are quite common,
        // so use a special subclass that's more convenient to use.
        const ret: TypedGroup = begin.encodings.length == 1
            ? new TypedValue(begin.encodings[0], this.decodeAnyUntypedValue(begin.encodings[0]))
            : new TypedGroup(
                begin.encodings,
                begin.encodings.map((e) => this.decodeAnyUntypedValue(e))
            );

        const end = this.reader.next().value;
        if (!(end instanceof EndTypedValues)) {
            throw new EvalError(`Expected EndTypedValues, not ${typeof end}`);
        }

        return ret;
    }

    decodeAll() {
        const contents = [];

        while (true) {
            const lookahead = this.reader.next();
            if (lookahead.done) {
                break;
            }
            contents.push(this.decodeTypedValues(lookahead.value));
        }

        return contents;
    }

}
