import { DateTime } from 'luxon'
import { BaseModel, BelongsTo, HasMany, belongsTo, column, hasMany } from '@ioc:Adonis/Lucid/Orm'
import Classroom from './Classroom'
import MeetingLink from './MeetingLink'

export default class Meeting extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public title: string

  @column()
  public description: string

  @column()
  public classroomId: number

  @column()
  public isDraft: boolean

  @belongsTo(() => Classroom)
  public classroom: BelongsTo<typeof Classroom>

  @hasMany(() => MeetingLink)
  public links: HasMany<typeof MeetingLink>

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime
}
