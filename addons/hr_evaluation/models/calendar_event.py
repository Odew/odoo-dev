# -*- coding: utf-8 -*-
from openerp import api, models


class CalendarEvent(models.Model):
    """ Model for Calendar Event """
    _inherit = 'calendar.event'

    @api.model
    def create(self, vals):
        result = super(CalendarEvent, self).create(vals)
        if self.env.context.get('active_model') == 'hr.evaluation':
            evaluation = self.env['hr.evaluation'].browse(self.env.context.get('active_id'))
            evaluation.with_context(meeting=True).write({
                'meeting_id': result.id,
                'interview_deadline': result.start_date if result.allday else result.start_datetime
            })
        return result
