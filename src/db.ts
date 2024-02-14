import { readFile } from "fs/promises";
import { Writer } from "steno";

type Parse<TData> = (value: string) => TData;

class AsyncJSONFile<TData = unknown> {
    readonly filename: string;
    writer: Writer;
    private readonly parse: Parse<TData> = JSON.parse;
    private readonly stringify = JSON.stringify;

    constructor(filename: string) {
        this.filename = filename;
        this.writer = new Writer(filename);
    }

    async read(): Promise<TData | null> {
        try {
            return this.parse(await readFile(this.filename, "utf-8"));
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }
            throw e;
        }
    }

    write(data: TData): Promise<void> {
        return this.writer.write(this.stringify(data));
    }
}

interface IDatabaseEntity {
    id: string;
}

interface ICollection<T> {
    [name: string]: T[];
}

export default class SimpleDB<T extends IDatabaseEntity> {
    readonly collection: string;
    private storage: AsyncJSONFile<ICollection<T>>;

    constructor(filename: string, collection: string) {
        this.storage = new AsyncJSONFile<ICollection<T>>(filename);
        this.collection = collection;
    }

    async create(newEntity: T): Promise<T> {
        const [allEntities, collectionEntities] = await this.getEntitiesState();
        const newEntities = {
            ...allEntities,
            [this.collection]: collectionEntities
                ? [...collectionEntities, newEntity]
                : [newEntity],
        };
        await this.writeEntitiesState(newEntities);
        return newEntity;
    }

    async getAll(): Promise<T[]> {
        const [_, entities] = await this.getEntitiesState();
        return entities ?? [];
    }

    async getByID(id: string): Promise<T | undefined> {
        const [_, entities] = await this.getEntitiesState();
        if (entities) {
            return entities.find((entity) => entity.id === id);
        }
        return undefined;
    }

    async update(
        id: string,
        updatedEntity: Partial<Omit<T, "id">>,
    ): Promise<T | null> {
        const [allEntities, collectionEntities] = await this.getEntitiesState();
        if (!collectionEntities) return null;

        const entityIndex = collectionEntities.findIndex(
            (entity) => entity.id === id,
        );
        if (entityIndex === -1) return null;

        const updated = {
            ...collectionEntities[entityIndex],
            ...updatedEntity,
        };
        collectionEntities[entityIndex] = updated;

        const updatedEntities = {
            ...allEntities,
            [this.collection]: collectionEntities,
        };
        await this.writeEntitiesState(updatedEntities);
        return updated;
    }

    async delete(id: string): Promise<boolean> {
        const [allEntities, collectionEntities] = await this.getEntitiesState();
        if (!collectionEntities) return false;

        const entityIndex = collectionEntities.findIndex(
            (entity) => entity.id === id,
        );
        if (entityIndex === -1) return false;

        collectionEntities.splice(entityIndex, 1);

        const updatedEntities = {
            ...allEntities,
            [this.collection]: collectionEntities,
        };
        await this.writeEntitiesState(updatedEntities);
        return true;
    }

    async getEntities(): Promise<ICollection<T> | null> {
        return await this.storage.read();
    }

    async deleteEntities(entities: ICollection<T>): Promise<boolean> {
        delete entities[this.collection];
        await this.storage.write(entities);
        return true;
    }

    async deleteCollection(): Promise<boolean> {
        const entities = await this.getEntities();
        if (entities) {
            return this.deleteEntities(entities);
        }
        return false;
    }

    private async getEntitiesState(): Promise<
        [ICollection<T> | null, T[] | null]
    > {
        const allEntities = await this.storage.read();
        const collectionEntities = allEntities
            ? allEntities[this.collection]
            : null;
        return [allEntities, collectionEntities];
    }

    private async writeEntitiesState(entities: ICollection<T>): Promise<void> {
        return this.storage.write(entities);
    }
}
