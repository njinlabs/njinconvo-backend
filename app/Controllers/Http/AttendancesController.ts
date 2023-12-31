import { AuthContract } from '@ioc:Adonis/Addons/Auth'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Database from '@ioc:Adonis/Lucid/Database'
import { ModelQueryBuilderContract } from '@ioc:Adonis/Lucid/Orm'
import Meeting from 'App/Models/Meeting'
import MeetingAttendance from 'App/Models/MeetingAttendance'
import { schema, rules } from '@ioc:Adonis/Core/Validator'
import AttendanceDetail from 'App/Models/AttendanceDetail'
import { DateTime } from 'luxon'

export default class AttendancesController {
  private async getMeeting(
    auth: AuthContract,
    id: string | number,
    leadOnly = false
  ): Promise<Meeting> {
    let meetingQuery: ModelQueryBuilderContract<typeof Meeting, Meeting> = Meeting.query().where(
      'meetings.id',
      id
    )

    if (auth.use('user').user!.role !== 'administrator') {
      meetingQuery.whereHas('group', (query) =>
        query.whereHas('users', (query) => {
          query.where('users.id', auth.use('user').user!.id)
          if (leadOnly) {
            query.wherePivot('group_user.role', 'lead')
          }
        })
      )
    }

    return (await meetingQuery.firstOrFail()) as Meeting
  }

  public async save({ auth, params, request }: HttpContextContract) {
    const meeting = await this.getMeeting(auth, params.id, true)

    const {
      allow_self_attendance: allowSelfAttendance = false,
      self_attendance_due: selfAttendanceDue,
      show_it_to_participants: showItToParticipants,
      details,
    } = await request.validate({
      schema: schema.create({
        allow_self_attendance: schema.boolean.optional(),
        self_attendance_due: schema.date.optional({ format: 'yyyy-MM-dd HH:mm:ss' }, [
          rules.requiredIfExists('allow_self_attendance'),
        ]),
        show_it_to_participants: schema.boolean(),
        details: schema.array().members(
          schema.object().members({
            user_id: schema.number(),
            status: schema.enum(['present', 'sick', 'permission', 'absent']),
          })
        ),
      }),
    })

    return await Database.transaction(async (trx) => {
      const attendance = await MeetingAttendance.updateOrCreate(
        {
          meetingId: meeting.id,
        },
        {
          allowSelfAttendance,
          selfAttendanceDue: allowSelfAttendance ? selfAttendanceDue : null,
          showItToParticipants,
        },
        {
          client: trx,
        }
      )

      await meeting.load('group')
      await meeting.group.load('users')

      await AttendanceDetail.updateOrCreateMany(
        ['userId', 'meetingAttendanceId'],
        details
          .filter((detail) => meeting.group.users.map((item) => item.id).includes(detail.user_id))
          .map((detail) => ({
            userId: detail.user_id,
            meetingAttendanceId: attendance.id,
            status: detail.status,
          })),
        {
          client: trx,
        }
      )

      await attendance.load('details')

      return attendance.serialize()
    })
  }

  public async show({ auth, params }: HttpContextContract) {
    const meeting = await this.getMeeting(auth, params.id)
    const attendance = await MeetingAttendance.query()
      .where('meeting_attendances.meeting_id', meeting.id)
      .preload('details')
      .firstOrFail()

    return attendance.serialize()
  }

  public async showSelf({ auth, params }: HttpContextContract) {
    const meeting = await this.getMeeting(auth, params.id)
    const attendance = await meeting
      .related('attendance_details')
      .query()
      .where('attendance_details.user_id', auth.use('user').user!.id)
      .firstOrFail()

    return attendance.serialize()
  }

  public async saveSelf({ auth, params, response, request }: HttpContextContract) {
    const meeting = await this.getMeeting(auth, params.id)
    await meeting.load('attendance')

    if (
      (meeting.attendance.selfAttendanceDue &&
        meeting.attendance.selfAttendanceDue < DateTime.now()) ||
      !meeting.attendance.allowSelfAttendance
    ) {
      return response.methodNotAllowed()
    }

    const { status } = await request.validate({
      schema: schema.create({
        status: schema.enum(['present', 'sick', 'permission', 'absent']),
      }),
    })

    const detail = await AttendanceDetail.updateOrCreate(
      {
        userId: auth.use('user').user!.id,
        meetingAttendanceId: meeting.attendance.id,
      },
      {
        status,
      }
    )

    return detail.serialize()
  }
}
