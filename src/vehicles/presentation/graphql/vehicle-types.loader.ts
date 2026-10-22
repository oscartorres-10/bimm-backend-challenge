import { Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import type { VehicleType } from '../../domain/vehicle-catalog.model';
import { VehicleCatalogRepository } from '../../domain/vehicle-catalog.repository';

export type VehicleTypesLoader = DataLoader<number, VehicleType[]>;

@Injectable()
export class VehicleTypesLoaderFactory {
  /** WeakMap: entries vanish automatically when the request context is garbage-collected. */
  private readonly loaders = new WeakMap<object, VehicleTypesLoader>();

  constructor(private readonly catalog: VehicleCatalogRepository) {}

  /** Returns the loader for this request, creating it on first use. */
  forContext(context: object): VehicleTypesLoader {
    let loader = this.loaders.get(context);
    if (!loader) {
      loader = new DataLoader<number, VehicleType[]>(async (makeIds) => {
        const byMakeId = await this.catalog.findVehicleTypesByMakeIds(makeIds);
        // DataLoader requires one result per key, in the same order.
        return makeIds.map((id) => byMakeId.get(id) ?? []);
      });
      this.loaders.set(context, loader);
    }
    return loader;
  }
}
