import 'reflect-metadata';

export const ENFORCE_MODEL_TYPE_METADATA_KEY = 'foundry:enforce_model_type';
export type RequiredModelType = 'chat' | 'embedding';

export function EnforceModelType(required: RequiredModelType) {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    Reflect.defineMetadata(ENFORCE_MODEL_TYPE_METADATA_KEY, required, descriptor.value);
    return descriptor;
  };
}
