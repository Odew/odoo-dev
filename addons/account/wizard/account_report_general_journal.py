from openerp import models, api


class account_general_journal(models.TransientModel):
    _inherit = "account.common.journal.report"
    _name = 'account.general.journal'
    _description = 'Account General Journal'

    journal_ids = fields.Many2many('account.journal', string='Journals', required=True)

    @api.multi
    def _print_report(self, data):
        data = self.pre_print_report(data)
        return self.env['report'].get_action([], 'account.report_generaljournal', data=data)
