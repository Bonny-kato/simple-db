import { readFile } from "fs/promises";
import { Writer } from "steno";

type Parse<TData> = (value: string) => TData;

class AsyncJSONFile<TData = unknown> {
    private readonly parse: Parse<TData> = JSON.parse;
    private readonly stringify = JSON.stringify;
    readonly #filename: string;
    #writer: Writer;

    constructor(filename: string) {
        this.#filename = filename;
        this.#writer = new Writer(filename);
    }

    async read(): Promise<TData | null> {
        try {
            return this.parse(await readFile(this.#filename, "utf-8"));
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }
            throw e;
        }
    }

    write(data: TData): Promise<void> {
        return this.#writer.write(this.stringify(data));
    }
}

interface IDatabaseEntity {
    id: string;
}

interface ICollection<T> {
    [name: string]: T[];
}

export default class AsyncJSONFileBasedDB<T extends IDatabaseEntity> {
    readonly collection: string;
    private storage: AsyncJSONFile<ICollection<T>>;

    constructor(filename: string, collection: string) {
        this.storage = new AsyncJSONFile<ICollection<T>>(filename);
        this.collection = collection;
    }

    async initializeDB() {
        await this.storage.write({});
    }

    async create(newEntity: T): Promise<T> {
        let newEntities;
        const allEntities = await this.storage.read();
        const collectionEntities = await this.getCollectionData();
        if (allEntities) {
            if (collectionEntities) {
                newEntities = {
                    ...allEntities,
                    [this.collection]: [...collectionEntities, newEntity],
                };
            } else {
                newEntities = {
                    ...allEntities,
                    [this.collection]: [newEntity],
                };
            }
        } else {
            newEntities = {
                [this.collection]: [newEntity],
            };
        }

        await this.storage.write(newEntities);
        return newEntity;
    }

    async getAll(): Promise<T[]> {
        const entities = await this.getCollectionData();
        return entities ?? [];
    }

    async getByID(id: string): Promise<T | undefined> {
        const entities = await this.getCollectionData();
        if (entities) {
            return entities
                ? entities.find((entity) => entity.id === id)
                : undefined;
        }
        return undefined;
    }

    async update(
        id: string,
        updatedEntity: Partial<Omit<T, "id">>,
    ): Promise<T | null> {
        let updatedEntities;
        const entities = await this.getCollectionData();
        if (entities) {
            const entityIndex = entities.findIndex(
                (entity) => entity.id === id,
            );
            if (entityIndex === -1) {
                return null;
            }
            const updated = { ...entities[entityIndex], ...updatedEntity };
            entities[entityIndex] = updated;

            const allEntities = await this.storage.read();
            if (allEntities) {
                updatedEntities = {
                    ...allEntities,
                    [this.collection]: entities,
                };
            } else {
                updatedEntities = {
                    [this.collection]: entities,
                };
            }

            await this.storage.write(updatedEntities);
            return updated;
        }
        return null;
    }

    async delete(id: string): Promise<boolean> {
        let updatedEntities;

        const entities = await this.getCollectionData();
        if (entities) {
            const entityIndex = entities.findIndex(
                (entity) => entity.id === id,
            );
            if (entityIndex === -1) {
                return false;
            }
            entities.splice(entityIndex, 1);

            const allEntities = await this.storage.read();
            if (allEntities) {
                updatedEntities = {
                    ...allEntities,
                    [this.collection]: entities,
                };
            } else {
                updatedEntities = {
                    [this.collection]: entities,
                };
            }

            await this.storage.write(updatedEntities);
            return true;
        }
        return false;
    }

    private async getCollectionData(): Promise<T[] | null> {
        const entities = await this.storage.read();
        if (entities) {
            return entities[this.collection] ?? null;
        }
        return null;
    }
}
