import { Injectable } from '@nestjs/common';
import { RecognizeParamsDTO } from '../../../interfaces';
import { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { resolveParamEnumValues } from './param-enum-constraint';

@Injectable()
export class ParamSchemaService {
  buildRecognizerParamsSchema(
    schema: SkillMatchResult['paramsSchema'],
    context?: Record<string, unknown>
  ): NonNullable<RecognizeParamsDTO['params_schema']> {
    const allProperties = schema?.properties || {};
    const allRequired = Array.isArray(schema?.required) ? schema.required : [];
    const narrowedFieldNames = this.resolveRecognizerFieldNamesForContext(allProperties, context);

    if (narrowedFieldNames.length === 0) {
      return {
        properties: this.buildRecognizerParamsSchemaProperties(allProperties),
        required: allRequired,
      };
    }

    const narrowedProperties = narrowedFieldNames.reduce<
      NonNullable<AvailableSkillDefinition['paramsSchema']>['properties']
    >((acc, name) => {
      const property = allProperties[name];
      if (property) {
        acc[name] = property;
      }
      return acc;
    }, {});
    const narrowedRequired = this.resolveRecognizerRequiredFieldsForContext(
      allRequired,
      narrowedFieldNames,
      context
    );

    return {
      properties: this.buildRecognizerParamsSchemaProperties(narrowedProperties),
      required: narrowedRequired,
    };
  }

  buildRecognizerParamsSchemaProperties(
    properties: NonNullable<AvailableSkillDefinition['paramsSchema']>['properties']
  ): NonNullable<RecognizeParamsDTO['params_schema']>['properties'] {
    return Object.fromEntries(
      Object.entries(properties).map(([name, schema]) => {
        const { required: _required, default: _schemaDefault, ...rest } = schema;
        const enumValues = resolveParamEnumValues(schema);
        const recognizerProperty: NonNullable<
          RecognizeParamsDTO['params_schema']
        >['properties'][string] = {
          ...rest,
          ...(enumValues ? { enum: enumValues } : {}),
        };
        return [name, recognizerProperty];
      })
    );
  }

  resolveRecognizerFieldNamesForContext(
    properties: NonNullable<AvailableSkillDefinition['paramsSchema']>['properties'],
    context?: Record<string, unknown>
  ): string[] {
    if (!context || context.mode !== 'waiting_input_resume') {
      return [];
    }

    const schemaKeys = new Set(Object.keys(properties));
    const missingInputs = Array.isArray(context.missing_inputs)
      ? context.missing_inputs.filter(
          (item): item is string => typeof item === 'string' && schemaKeys.has(item)
        )
      : [];
    const alreadyCollectedKeys =
      typeof context.already_collected === 'object' &&
      context.already_collected &&
      !Array.isArray(context.already_collected)
        ? Object.keys(context.already_collected as Record<string, unknown>).filter((key) =>
            schemaKeys.has(key)
          )
        : [];

    return Array.from(new Set([...missingInputs, ...alreadyCollectedKeys]));
  }

  resolveRecognizerRequiredFieldsForContext(
    allRequired: string[],
    narrowedFieldNames: string[],
    context?: Record<string, unknown>
  ): string[] {
    if (!context || context.mode !== 'waiting_input_resume') {
      return allRequired;
    }

    const narrowedSet = new Set(narrowedFieldNames);
    const missingInputs = Array.isArray(context.missing_inputs)
      ? context.missing_inputs.filter((item): item is string => typeof item === 'string')
      : [];

    return missingInputs.filter((name) => narrowedSet.has(name));
  }
}
