import {DynamoDBParams, Entry, InsertOrUpdateOptions, Key} from './types'

export interface UpdateParams<T> extends DynamoDBParams {
  key: Key
  value: T
  options?: InsertOrUpdateOptions
}
export async function update<TOld = object, TNew = object>({
  client,
  tableName,
  key,
  options,
  value,
}: UpdateParams<TNew>): Promise<Entry<TOld> | void> {
  const now = new Date()
  const upsert = options.upsert !== undefined && options.upsert
  const utcSecondsSinceEpoch =
    Math.round(now.getTime() / 1000) + now.getTimezoneOffset() * 60
  const response = await client.updateItem({
    TableName: tableName,
    ConditionExpression: upsert ? undefined : 'attribute_exists(PartitionId)',
    ReturnValues: 'ALL_OLD',
    Key: {
      PartitionKey: {
        S: `${key.type}/${key.id}`,
      },
      SortKey: {
        S: `${key.type}/${key.id}`,
      },
    },
    ExpressionAttributeNames: {
      '#RawValue': 'RawValue',
      '#CreatedAt': 'CreatedAt',
      '#ModifiedAt': 'ModifiedAt',
      ...(options?.deletedAt !== undefined ||
      (options?.isDeleted !== undefined && options.isDeleted)
        ? {'#DeletedAt': 'DeletedAt'}
        : {}),
      '#IsDeleted': 'IsDeleted',
      ...(options?.timeToLiveInSeconds !== undefined ||
      (options?.upsert !== undefined && options.upsert)
        ? {'#TTL': 'TTL'}
        : {}),
    },
    ExpressionAttributeValues: {
      ':RawValue': {
        S: JSON.stringify({value}),
      },
      ':CreatedAt': {
        S: options?.createdAt?.toISOString() ?? now.toISOString(),
      },
      ':ModifiedAt': {
        S: options?.modifiedAt?.toISOString() ?? now.toISOString(),
      },
      ...(options?.deletedAt !== undefined
        ? {
            ':DeletedAt': {
              S: options.deletedAt.toISOString(),
            },
          }
        : options?.isDeleted !== undefined && options.isDeleted
        ? {
            ':DeletedAt': {
              S: now.toISOString(),
            },
          }
        : {}),
      ':IsDeleted': {
        BOOL: options?.isDeleted ?? false,
      },
      ...(options?.timeToLiveInSeconds !== undefined
        ? {
            ':TTL': {
              N: `${options.timeToLiveInSeconds + utcSecondsSinceEpoch}`,
            },
          }
        : {}),
    },
    UpdateExpression: `SET #RawValue = :RawValue, #ModifiedAt = :ModifiedAt, #IsDeleted = :IsDeleted, #CreatedAt = ${
      upsert ? ':CreatedAt' : 'if_not_exist(#CreatedAt, :CreatedAt)'
    }${
      options?.isDeleted !== undefined && options.isDeleted
        ? ', #DeletedAt = :DeletedAt'
        : ''
    }${options?.timeToLiveInSeconds !== undefined ? ', #TTL = :TTL' : ''}${
      options?.timeToLiveInSeconds === undefined &&
      options?.upsert !== undefined &&
      options.upsert
        ? ', REMOVE #TTL'
        : ''
    }`,
  })
  return options.upsert
    ? {
        createdAt: new Date(response.Attributes.CreatedAt.S),
        modifiedAt: new Date(response.Attributes.ModifiedAt.S),
        isDeleted: response.Attributes.IsDeleted.BOOL,
        value: JSON.parse(response.Attributes.RawValue.S),
        deletedAt: response.Attributes.DeletedAt
          ? new Date(response.Attributes.DeletedAt.S)
          : undefined,
      }
    : undefined
}