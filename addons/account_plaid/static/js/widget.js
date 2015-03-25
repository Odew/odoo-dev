(function() {
    "use strict";
    var QWeb = openerp.web.qweb;
    var _t = openerp.web._t;
    /**
     * Create new plaid widget.
     * Used to show selections question
     */
    openerp.web.form.ShowSelectionsLineWidget = openerp.web.form.AbstractField.extend({
	events: {
	    'change .choices': 'compute_response',
	},
        render_value: function(){
            var self = this;
	    if (this.field_manager.datarecord.selections){
		var json = JSON.parse(this.field_manager.datarecord.selections)
		this.$el.append(QWeb.render('SelectionsTemplate', {mfa: json.mfa}))
		this.compute_response();
	    }
        },
	compute_response: function(){
	    var resp = _.map(this.$el.find(".choices"), function(choice){ return choice.value; });
	    var resp_str = "[\"" + resp.join("\", \"") + "\"]";
	    this.field_manager.set_values({'response': resp_str});
	},
    });

/**
 * Registry of form fields
 */
openerp.web.form.widgets.add('selections', 'openerp.web.form.ShowSelectionsLineWidget');

})();
