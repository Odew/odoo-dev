odoo.define('web_calendar.CalendarView', ['web.core', 'web.data', 'web.form_common', 'web.Model', 'web.time', 'web.View', 'web_calendar.widgets'], function (require) {
"use strict";
/*---------------------------------------------------------
 * OpenERP web_calendar
 *---------------------------------------------------------*/

var core = require('web.core');
var data = require('web.data');
var form_common = require('web.form_common');
var Model = require('web.Model');
var time = require('web.time');
var View = require('web.View');
var widgets = require('web_calendar.widgets');

var CompoundDomain = data.CompoundDomain;

var _t = core._t;
var _lt = core._lt;
var QWeb = core.qweb;

console.log($.fullCalendar.View.prototype.formatRange);
$.fullCalendar.View.prototype.formatRange = function (range, formatStr, separator) {
    var date1 = moment.parseZone(range.start);

    var date2 = range.end;
    if (!date2.hasTime()) { // all-day?
        date2 = date2.clone().subtract(1); // convert to inclusive. last ms of previous day
    }
	date2 = moment.parseZone(date2);

	var localeData = (date1.localeData || date1.lang).call(date1); // works with moment-pre-2.8

	formatStr = localeData.longDateFormat(formatStr) || formatStr;

	separator = separator || ' \u2014 ';

    var format1 = date1.format(formatStr);
    var format2 = date2.format(formatStr);
    if (format1 === format2) {
        return format1;
    }
    if (this.opt('isRTL')) {
        return format2 + separator + format1;
    } else {
        return format1 + separator + format2;
    }
};

function get_fc_defaultOptions() {
    var shortTimeformat = moment._locale._longDateFormat.LT;
    var dateFormat = time.strftime_to_moment_format(_t.database.parameters.date_format);

    return {
        weekNumberTitle: _t("W"),
        allDayText: _t("All day"),
        buttonText : {
            today:    _t("Today"),
            month:    _t("Month"),
            week:     _t("Week"),
            day:      _t("Day")
        },
        monthNames: moment.months(),
        monthNamesShort: moment.monthsShort(),
        dayNames: moment.weekdays(),
        dayNamesShort: moment.weekdaysShort(),
        firstDay: moment._locale._week.dow,
        weekNumbers: true,
        axisFormat : shortTimeformat.replace(/:mm/,'(:mm)'),
        timeFormat : shortTimeformat.replace(/:mm/,'(:mm)'),  // 7pm
        views: {
            month: {
                titleFormat: 'MMMM YYYY',
                columnFormat: 'ddd'
            },
            week: {
                titleFormat: dateFormat,
                columnFormat: 'ddd ' + dateFormat
            },
            day: {
                titleFormat: dateFormat,
                columnFormat: 'dddd ' + dateFormat
            },
            agenda: {
                timeFormat: shortTimeformat,
            }
        },
        weekMode : 'liquid',
        aspectRatio: 1.8,
        snapMinutes: 15,
    };
}

function is_virtual_id(id) {
    return typeof id === "string" && id.indexOf('-') >= 0;
}

var CalendarView = View.extend({
    template: "CalendarView",
    display_name: _lt('Calendar'),
    quick_create_instance: widgets.QuickCreate,

    init: function (parent, dataset, view_id, options) {
        this._super(parent);
        this.ready = $.Deferred();
        this.set_default_options(options);
        this.dataset = dataset;
        this.model = dataset.model;
        this.fields_view = {};
        this.view_id = view_id;
        this.view_type = 'calendar';
        this.color_map = {};
        this.selected_filters = [];

        this.shown = $.Deferred();
    },

    set_default_options: function(options) {
        this._super(options);
        _.defaults(this.options, {
            confirm_on_delete: true
        });
    },

    destroy: function() {
        this.$calendar.fullCalendar('destroy');
        if (this.$small_calendar) {
            this.$small_calendar.datepicker('destroy');
        }
        this._super.apply(this, arguments);
    },

    view_loading: function (fv) {
        /* xml view calendar options */
        var attrs = fv.arch.attrs,
            self = this;
        this.fields_view = fv;
        this.$calendar = this.$el.find(".oe_calendar_widget");

        this.info_fields = [];

        /* buttons */
        this.$buttons = $(QWeb.render("CalendarView.buttons", {'widget': this}));
        if (this.options.$buttons) {
            this.$buttons.appendTo(this.options.$buttons);
        } else {
            this.$el.find('.oe_calendar_buttons').replaceWith(this.$buttons);
        }

        this.$buttons.on('click', 'button.oe_calendar_button_new', function () {
            self.dataset.index = null;
            self.do_switch_view('form');
        });

        if (!attrs.date_start) {
            throw new Error(_t("Calendar view has not defined 'date_start' attribute."));
        }

        this.$el.addClass(attrs['class']);

        this.name = fv.name || attrs.string;
        this.view_id = fv.view_id;

        this.mode = attrs.mode;                 // one of month, week or day
        this.date_start = attrs.date_start;     // Field name of starting date field
        this.date_delay = attrs.date_delay;     // duration
        this.date_stop = attrs.date_stop;
        this.all_day = attrs.all_day;
        this.how_display_event = '';
        this.attendee_people = attrs.attendee;

        //if quick_add = False, we don't allow quick_add
        //if quick_add = not specified in view, we use the default quick_create_instance
        //if quick_add = is NOT False and IS specified in view, we this one for quick_create_instance'   


        this.quick_add_pop = (attrs.quick_add == null || _.str.toBoolElse(attrs.quick_add, true));
        // The display format which will be used to display the event where fields are between "[" and "]"
        if (!(attrs.display == null)) {
            this.how_display_event = attrs.display; // String with [FIELD]
        }

        // If this field is set ot true, we don't open the event in form view, but in a popup with the view_id passed by this parameter
        if (attrs.event_open_popup == null || !_.str.toBoolElse(attrs.event_open_popup, true)) {
            this.open_popup_action = false;
        } else {
            this.open_popup_action = attrs.event_open_popup;
        }
        // If this field is set to true, we will use the calendar_friends model as filter and not the color field.
        this.useContacts = (!(attrs.use_contacts == null) && _.str.toBool(attrs.use_contacts)) && (!(self.options.$sidebar == null));
        // If this field is set ot true, we don't add itself as an attendee when we use attendee_people to add each attendee icon on an event
        // The color is the color of the attendee, so don't need to show again that it will be present
        this.colorIsAttendee = (!(attrs.color_is_attendee == null || !_.str.toBoolElse(attrs.color_is_attendee, true))) && (!(self.options.$sidebar == null));
        // if we have not sidebar, (eg: Dashboard), we don't use the filter "coworkers"
        if (self.options.$sidebar == null) {
            this.useContacts = false;
            this.colorIsAttendee = false;
            this.attendee_people = undefined;
        }

        /*
                Will be more logic to do it in futur, but see below to stay Retro-compatible
                
                if (isNull(attrs.avatar_model)) {
                    this.avatar_model = 'res.partner'; 
                }
                else {
                    if (attrs.avatar_model == 'False') {
                        this.avatar_model = null;
                    }
                    else {  
                        this.avatar_model = attrs.avatar_model;
                    }
                }            
        */
        if (attrs.avatar_model == null) {
            this.avatar_model = null;
        } else {
            this.avatar_model = attrs.avatar_model;
        }

        if (attrs.avatar_title == null) {
            this.avatar_title = this.avatar_model;
        } else {
            this.avatar_title = attrs.avatar_title;
        }

        if (attrs.avatar_filter == null) {
            this.avatar_filter = this.avatar_model;
        } else {
            this.avatar_filter = attrs.avatar_filter;
        }

        this.color_field = attrs.color;

        if (this.color_field && this.selected_filters.length === 0) {
            var default_filter;
            if ((default_filter = this.dataset.context['calendar_default_' + this.color_field])) {
                this.selected_filters.push(default_filter + '');
            }
        }

        this.fields = fv.fields;

        for (var fld = 0; fld < fv.arch.children.length; fld++) {
            this.info_fields.push(fv.arch.children[fld].attrs.name);
        }

        self.shown.done(this._do_show_init.bind(this));
        var edit_check = new Model(this.dataset.model)
            .call("check_access_rights", ["write", false])
            .then(function (write_right) {
                self.write_right = write_right;
            });
        var init = new Model(this.dataset.model)
            .call("check_access_rights", ["create", false])
            .then(function (create_right) {
                self.create_right = create_right;
                self.ready.resolve();
                self.trigger('calendar_view_loaded', fv);
            });
        return $.when(edit_check, init);
    },
    _do_show_init: function () {
        var self = this;
        this.init_calendar().then(function() {
            $(window).trigger('resize');
            self.trigger('calendar_view_loaded', self.fields_view);
        });
    },
    get_fc_init_options: function () {
        //Documentation here : http://arshaw.com/fullcalendar/docs/
        var self = this;
        return  $.extend({}, get_fc_defaultOptions(), {
            defaultView: this.mode == "week" ? "agendaWeek"
                       : this.mode == "day" ? "agendaDay"
                       : "month",
            header: {
                left: 'prev,next today',
                center: 'title',
                right: 'month,agendaWeek,agendaDay'
            },
            selectable: !this.options.read_only_mode && this.create_right,
            selectHelper: true,
            editable: !this.options.read_only_mode,
            droppable: true,

            // callbacks
            eventDrop: function (event) {
                var data = self.get_event_data(event);
                self.proxy('update_record')(event._id, data); // we don't revert the event, but update it.
            },
            eventResize: function (event) {
                var data = self.get_event_data(event);
                self.proxy('update_record')(event._id, data);
            },
            eventRender: function (event, $element, view) {
                $element.find('.fc-title').html(event.title);
            },
            eventClick: function (event) { self.open_event(event._id,event.title); },
            select: function (start_date, end_date, event) {
                var data_template = self.get_event_data({
                    start: start_date,
                    end: end_date,
                    allDay: event && event.allDay,
                });
                self.open_quick_create(data_template);

            },

            unselectAuto: false,


        });
    },

    calendarMiniChanged: function (context) {
        return function(datum,obj) {
            var curView = context.$calendar.fullCalendar( 'getView');
            var curDate = new Date(obj.currentYear , obj.currentMonth, obj.currentDay);

            if (curView.name == "agendaWeek") {
                if (curDate <= curView.end && curDate >= curView.start) {
                    context.$calendar.fullCalendar('changeView','agendaDay');
                }
            }
            else if (curView.name != "agendaDay" || (curView.name == "agendaDay" && moment(curDate).diff(moment(curView.start))===0)) {
                    context.$calendar.fullCalendar('changeView','agendaWeek');
            }
            context.$calendar.fullCalendar('gotoDate', obj.currentYear , obj.currentMonth, obj.currentDay);
        };
    },

    init_calendar: function() {
        var self = this;
         
        if (!this.sidebar && this.options.$sidebar) {
            var translate = get_fc_defaultOptions();
            this.sidebar = new widgets.Sidebar(this);
            this.sidebar.appendTo(this.$el.find('.oe_calendar_sidebar_container'));

            this.$small_calendar = self.$el.find(".oe_calendar_mini");
            this.$small_calendar.datepicker({ 
                onSelect: self.calendarMiniChanged(self),
                dayNamesMin : translate.dayNamesShort,
                monthNames: translate.monthNamesShort,
                firstDay: translate.firstDay,
            });

            this.extraSideBar();                
        }
        self.$calendar.fullCalendar(self.get_fc_init_options());
        
        return $.when();
    },
    extraSideBar: function() {
    },

    get_quick_create_class: function () {
        return widgets.QuickCreate;
    },
    open_quick_create: function(data_template) {
        if (!(this.quick == null)) {
            return this.quick.trigger('close');
        }
        var QuickCreate = this.get_quick_create_class();
        
        this.options.disable_quick_create =  this.options.disable_quick_create || !this.quick_add_pop;
        this.quick = new QuickCreate(this, this.dataset, true, this.options, data_template);
        this.quick.on('added', this, this.quick_created)
                .on('slowadded', this, this.slow_created)
                .on('close', this, function() {
                    this.quick.destroy();
                    delete this.quick;
                    this.$calendar.fullCalendar('unselect');
                });
        this.quick.replace(this.$el.find('.oe_calendar_qc_placeholder'));
        this.quick.focus();
        
    },

    /**
     * Refresh one fullcalendar event identified by it's 'id' by reading OpenERP record state.
     * If event was not existent in fullcalendar, it'll be created.
     */
    refresh_event: function(id) {
        var self = this;
        if (is_virtual_id(id)) {
            // Should avoid "refreshing" a virtual ID because it can't
            // really be modified so it should never be refreshed. As upon
            // edition, a NEW event with a non-virtual id will be created.
            console.warn("Unwise use of refresh_event on a virtual ID.");
        }
        this.dataset.read_ids([id], _.keys(this.fields)).done(function (incomplete_records) {
            self.perform_necessary_name_gets(incomplete_records).then(function(records) {
                // Event boundaries were already changed by fullcalendar, but we need to reload them:
                var new_event = self.event_data_transform(records[0]);
                // fetch event_obj
                var event_objs = self.$calendar.fullCalendar('clientEvents', id);
                if (event_objs.length == 1) { // Already existing obj to update
                    var event_obj = event_objs[0];
                    // update event_obj
                    _(new_event).each(function (value, key) {
                        event_obj[key] = value;
                    });
                    self.$calendar.fullCalendar('updateEvent', event_obj);
                } else { // New event object to create
                    self.$calendar.fullCalendar('renderEvent', new_event);
                    // By forcing attribution of this event to this source, we
                    // make sure that the event will be removed when the source
                    // will be removed (which occurs at each do_search)
                    self.$calendar.fullCalendar('clientEvents', id)[0].source = self.event_source;
                }
            });
        });
    },

    get_color: function(key) {
        if (this.color_map[key]) {
            return this.color_map[key];
        }
        var index = (((_.keys(this.color_map).length + 1) * 5) % 24) + 1;
        this.color_map[key] = index;
        return index;
    },
    

    /**
     * In o2m case, records from dataset won't have names attached to their *2o values.
     * We should make sure this is the case.
     */
    perform_necessary_name_gets: function(evts) {
        var def = $.Deferred();
        var self = this;
        var to_get = {};
        _(this.info_fields).each(function (fieldname) {
            if (!_(["many2one", "one2one"]).contains(
                self.fields[fieldname].type))
                return;
            to_get[fieldname] = [];
            _(evts).each(function (evt) {
                var value = evt[fieldname];
                if (value === false || (value instanceof Array)) {
                    return;
                }
                to_get[fieldname].push(value);
            });
            if (to_get[fieldname].length === 0) {
                delete to_get[fieldname];
            }
        });
        var defs = _(to_get).map(function (ids, fieldname) {
            return (new Model(self.fields[fieldname].relation))
                .call('name_get', ids).then(function (vals) {
                    return [fieldname, vals];
                });
        });

        $.when.apply(this, defs).then(function() {
            var values = arguments;
            _(values).each(function(value) {
                var fieldname = value[0];
                var name_gets = value[1];
                _(name_gets).each(function(name_get) {
                    _(evts).chain()
                        .filter(function (e) {return e[fieldname] == name_get[0];})
                        .each(function(evt) {
                            evt[fieldname] = name_get;
                        });
                });
            });
            def.resolve(evts);
        });
        return def;
    },
    
    /**
     * Transform OpenERP event object to fullcalendar event object
     */
    event_data_transform: function(evt) {
        var self = this;
        var date_start;
        var date_stop;
        var date_delay = evt[this.date_delay] || 1.0,
            all_day = this.all_day ? evt[this.all_day] : false,
            res_computed_text = '',
            the_title = '',
            attendees = [];

        if (!all_day) {
            date_start = time.auto_str_to_date(evt[this.date_start]);
            date_stop = this.date_stop ? time.auto_str_to_date(evt[this.date_stop]) : null;
        }
        else {
            date_start = time.auto_str_to_date(evt[this.date_start].split(' ')[0],'start');
            date_stop = this.date_stop ? time.auto_str_to_date(evt[this.date_stop].split(' ')[0],'start') : null;
        }

        if (this.info_fields) {
            var temp_ret = {};
            res_computed_text = this.how_display_event;
            
            _.each(this.info_fields, function (fieldname) {
                var value = evt[fieldname];
                if (_.contains(["many2one", "one2one"], self.fields[fieldname].type)) {
                    if (value === false) {
                        temp_ret[fieldname] = null;
                    }
                    else if (value instanceof Array) {
                        temp_ret[fieldname] = value[1]; // no name_get to make
                    }
                    else {
                        throw new Error("Incomplete data received from dataset for record " + evt.id);
                    }
                }
                else if (_.contains(["one2many","many2many"], self.fields[fieldname].type)) {
                    if (value === false) {
                        temp_ret[fieldname] = null;
                    }
                    else if (value instanceof Array)  {
                        temp_ret[fieldname] = value; // if x2many, keep all id !
                    }
                    else {
                        throw new Error("Incomplete data received from dataset for record " + evt.id);
                    }
                }
                else {
                    temp_ret[fieldname] = value;
                }
                res_computed_text = res_computed_text.replace("["+fieldname+"]",temp_ret[fieldname]);
            });

            
            if (res_computed_text.length) {
                the_title = res_computed_text;
            }
            else {
                var res_text= [];
                _.each(temp_ret, function(val,key) {
                    if( typeof(val) === 'boolean' && val === false ) { }
                    else { res_text.push(val); }
                });
                the_title = res_text.join(', ');
            }
            the_title = _.escape(the_title);
            
            
            var the_title_avatar = '';
            
            if (! _.isUndefined(this.attendee_people)) {
                var MAX_ATTENDEES = 3;
                var attendee_showed = 0;
                var attendee_other = '';

                _.each(temp_ret[this.attendee_people],
                    function (the_attendee_people) {
                        attendees.push(the_attendee_people);
                        attendee_showed += 1;
                        if (attendee_showed<= MAX_ATTENDEES) {
                            if (self.avatar_model !== null) {
                                   the_title_avatar += '<img title="' + self.all_attendees[the_attendee_people] + '" class="attendee_head"  \
                                                        src="/web/binary/image?model=' + self.avatar_model + '&field=image_small&id=' + the_attendee_people + '"></img>';
                            }
                            else {
                                if (!self.colorIsAttendee || the_attendee_people != temp_ret[self.color_field]) {
                                        var tempColor = (self.all_filters[the_attendee_people] !== undefined) 
                                                    ? self.all_filters[the_attendee_people].color
                                                    : (self.all_filters[-1] ? self.all_filters[-1].color : 1);
                                    the_title_avatar += '<i class="fa fa-user attendee_head color_'+tempColor+'" title="' + self.all_attendees[the_attendee_people] + '" ></i>';
                                }//else don't add myself
                            }
                        }
                        else {
                            attendee_other += self.all_attendees[the_attendee_people] +", ";
                        }
                    }
                );
                if (attendee_other.length>2) {
                    the_title_avatar += '<span class="attendee_head" title="' + attendee_other.slice(0, -2) + '">+</span>';
                }
                the_title = the_title_avatar + the_title;
            }
        }
        
        if (!date_stop && date_delay) {
            var m_start = moment(date_start).add(date_delay,'hours');
            date_stop = m_start.toDate();
        }
        var r = {
            'start': moment(date_start).format('YYYY-MM-DD HH:mm:ss'),
            'end': moment(date_stop).format('YYYY-MM-DD HH:mm:ss'),
            'title': the_title,
            'allDay': (this.fields[this.date_start].type == 'date' || (this.all_day && evt[this.all_day]) || false),
            'id': evt.id,
            'attendees':attendees
        };
        if (!self.useContacts || self.all_filters[evt[this.color_field]] !== undefined) {
            if (this.color_field && evt[this.color_field]) {
                var color_key = evt[this.color_field];
                if (typeof color_key === "object") {
                    color_key = color_key[0];
                }
                r.className = 'cal_opacity calendar_color_'+ this.get_color(color_key);
            }
        }
        else  { // if form all, get color -1
              r.className = 'cal_opacity calendar_color_'+ self.all_filters[-1].color;
        }
        return r;
    },
    
    /**
     * Transform fullcalendar event object to OpenERP Data object
     */
    get_event_data: function(event) {
        // Normalize event_end without changing fullcalendars event.
        var data = {
            name: event.title
        };            
        
        var event_end = event.end;
        //Bug when we move an all_day event from week or day view, we don't have a dateend or duration...            
        if (event_end == null) {
            event_end = moment(event.start).add(2, 'hours');
        }

        var date_start_day = event.start;
        var date_stop_day = event_end;
        if (event.allDay) {
            if (this.all_day) {
                date_start_day = moment(event.start).utc().set({hour: 0, minute: 0, second: 0, millisecond: 0});
                date_stop_day = moment(event_end).utc().set({hour: 0, minute: 0, second: 0, millisecond: 0});
            } else {
                date_start_day = moment(event.start).set({hour: 7, minute: 0, second: 0, millisecond: 0});
                date_stop_day = moment(event_end).set({hour: 19, minute: 0, second: 0, millisecond: 0});
            }
        }
        data[this.date_start] = time.datetime_to_str(date_start_day.toDate());
        if (this.date_stop) {
            data[this.date_stop] = time.datetime_to_str(date_stop_day.toDate());
        }

        if (this.all_day) {
            data[this.all_day] = event.allDay;
        }

        if (this.date_delay) {
            data[this.date_delay] = date_stop_day.diff(date_start_day, 'seconds') / 3600;
        }
        return data;
    },

    do_search: function (domain, context, _group_by) {
        var self = this;
        this.shown.done(function () {
            self._do_search(domain, context, _group_by);
        });
    },
    _do_search: function(domain, context, _group_by) {
        var self = this;
       if (! self.all_filters) {
            self.all_filters = {};
       }

        if (! _.isUndefined(this.event_source)) {
            this.$calendar.fullCalendar('removeEventSource', this.event_source);
        }
        this.event_source = {
            events: function(start, end, _tz, callback) {
                var current_event_source = self.event_source;
                self.dataset.read_slice(_.keys(self.fields), {
                    offset: 0,
                    domain: self.get_range_domain(domain, start, end),
                    context: context,
                }).done(function(events) {
                    if (self.dataset.index === null) {
                        if (events.length) {
                            self.dataset.index = 0;
                        }
                    } else if (self.dataset.index >= events.length) {
                        self.dataset.index = events.length ? 0 : null;
                    }

                    if (self.event_source !== current_event_source) {
                        console.log("Consecutive ``do_search`` called. Cancelling.");
                        return;
                    }
                    
                    if (!self.useContacts) {  // If we use all peoples displayed in the current month as filter in sidebars
                        self.now_filter_ids = [];

                        _.each(events, function (e) {
                            var key,val = null;
                            if (self.color_field.type == "selection") {
                                key = e[self.color_field];
                                val = _.find( self.color_field.selection, function(name){ return name[0] === key;});
                            } else {
                                key = e[self.color_field][0];
                                val = e[self.color_field];
                            }
                            if (!self.all_filters[key]) {
                                self.all_filters[key] = {
                                    value: key,
                                    label: val[1],
                                    color: self.get_color(key),
                                    avatar_model: (_.str.toBoolElse(self.avatar_filter, true) ? self.avatar_filter : false ),
                                    is_checked: true
                                };
                            }
                            if (! _.contains(self.now_filter_ids, key)) {
                                self.now_filter_ids.push(key);
                            }
                        });

                        if (self.sidebar) {
                            self.sidebar.filter.events_loaded();
                            self.sidebar.filter.set_filters();
                            
                            events = $.map(events, function (e) {
                                var key = self.color_field.type == "selection" ? e[self.color_field] : e[self.color_field][0];
                                if (_.contains(self.now_filter_ids, key) &&  self.all_filters[key].is_checked) {
                                    return e;
                                }
                                return null;
                            });
                        }
                        
                    } else { //WE USE CONTACT
                        if (self.attendee_people !== undefined) {
                            //if we don't filter on 'Everybody's Calendar
                            if (!self.all_filters[-1] || !self.all_filters[-1].is_checked) {
                                var checked_filter = $.map(self.all_filters, function(o) { if (o.is_checked) { return o.value; }});
                                // If we filter on contacts... we keep only events from coworkers
                                events = $.map(events, function (e) {
                                    if (_.intersection(checked_filter,e[self.attendee_people]).length) {
                                        return e;
                                    }
                                    return null;
                                });
                            }
                        }
                    }
                    var all_attendees = $.map(events, function (e) { return e[self.attendee_people]; });
                    all_attendees = _.chain(all_attendees).flatten().uniq().value();

                    self.all_attendees = {};
                    if (self.avatar_title !== null) {
                        new Model(self.avatar_title).query(["name"]).filter([["id", "in", all_attendees]]).all().then(function(result) {
                            _.each(result, function(item) {
                                self.all_attendees[item.id] = item.name;
                            });
                        }).done(function() {
                            return self.perform_necessary_name_gets(events).then(callback);
                        });
                    }
                    else {
                        _.each(all_attendees,function(item){
                                self.all_attendees[item] = '';
                        });
                        return self.perform_necessary_name_gets(events).then(callback);
                    }
                });
            },
            eventDataTransform: function (event) {
                return self.event_data_transform(event);
            },
        };
        this.$calendar.fullCalendar('addEventSource', this.event_source);
    },
    /**
     * Build OpenERP Domain to filter object by this.date_start field
     * between given start, end dates.
     */
    get_range_domain: function(domain, start, end) {
        function format(m) { return m.format('YYYY-MM-DD'); }

        // event starts during selected period
        var extend_domain = [
            '&',
            [this.date_start, '>=', format(start)],
            [this.date_start, '<', format(end)]
        ];

        // duration overlap
        if (this.date_stop) {
            extend_domain.unshift('|');
            // add test for overlapping with period in any way: event starts
            // before the end of the period and ends after its start
            extend_domain.push(
                '&',
                [this.date_start, '<', format(end)],
                [this.date_stop, '>=', format(start)]
            );
            //final -> (A & B) | (C & D) | (E & F) ->  | | & A B & C D & E F
        }
        return new CompoundDomain(domain, extend_domain);
    },

    /**
     * Updates record identified by ``id`` with values in object ``data``
     */
    update_record: function(id, data) {
        var self = this;
        var event_id;
        delete(data.name); // Cannot modify actual name yet
        var index = this.dataset.get_id_index(id);
        if (index !== null) {
            event_id = this.dataset.ids[index];
            this.dataset.write(event_id, data, {}).done(function() {
                if (is_virtual_id(event_id)) {
                    // this is a virtual ID and so this will create a new event
                    // with an unknown id for us.
                    self.$calendar.fullCalendar('refetchEvents');
                } else {
                    // classical event that we can refresh
                    self.refresh_event(event_id);
                }
            });
        }
        return false;
    },
    open_event: function(id, title) {
        var self = this;
        if (! this.open_popup_action) {
            this.dataset.select_id(id);
            this.do_switch_view('form', null, { mode: this.write_right ? 'edit' : 'view' });
        }
        else {
            var pop = new form_common.FormOpenPopup(this);
            var id_cast = parseInt(id, 10).toString() == id ? parseInt(id, 10) : id;
            pop.show_element(this.dataset.model, id_cast, this.dataset.get_context(), {
                title: _.str.sprintf(_t("View: %s"),title),
                view_id: +this.open_popup_action,
                res_id: id_cast,
                target: 'new',
                readonly:true
            });

           var form_controller = pop.view_form;
           form_controller.on("load_record", self, function(){
                var button_delete = _.str.sprintf("<button class='oe_button oe_bold delme'><span> %s </span></button>",_t("Delete"));
                var button_edit = _.str.sprintf("<button class='oe_button oe_bold editme oe_highlight'><span> %s </span></button>",_t("Edit Event"));
                
                pop.$el.closest(".modal").find(".modal-footer").prepend(button_delete);
                pop.$el.closest(".modal").find(".modal-footer").prepend(button_edit);
                
                $('.delme').click(
                    function() {
                        $('.oe_form_button_cancel').trigger('click');
                        self.remove_event(id);
                    }
                );
                $('.editme').click(
                    function() {
                        $('.oe_form_button_cancel').trigger('click');
                        self.dataset.index = self.dataset.get_id_index(id);
                        self.do_switch_view('form', null, { mode: "edit" });
                    }
                );
           });
        }
        return false;
    },

    do_show: function() {            
        this.do_push_state({});
        this.shown.resolve();
        return this._super();
    },
    is_action_enabled: function(action) {
        if (action === 'create' && !this.options.creatable) {
            return false;
        }
        return this._super(action);
    },

    /**
     * Handles a newly created record
     *
     * @param {id} id of the newly created record
     */
    quick_created: function (id) {
        /** Note:
         * it's of the most utter importance NOT to use inplace
         * modification on this.dataset.ids as reference to this
         * data is spread out everywhere in the various widget.
         * Some of these reference includes values that should
         * trigger action upon modification.
         */
        this.dataset.ids = this.dataset.ids.concat([id]);
        this.dataset.trigger("dataset_changed", id);
        this.refresh_event(id);
    },
    slow_created: function () {
        // refresh all view, because maybe some recurrents item
        var self = this;
        if (self.sidebar) {
            // force filter refresh
            self.sidebar.filter.is_loaded = false;
        }
        self.$calendar.fullCalendar('refetchEvents');
    },

    remove_event: function(id) {
        if (this.options.confirm_on_delete && !confirm(_t("Are you sure you want to delete this record ?"))) {
            return
        }
        return $.when(this.dataset.unlink([id])).then(function () {
            this.$calendar.fullCalendar('removeEvents', id);
        }.bind(this));
    },
});


core.view_registry.add('calendar', CalendarView);

return CalendarView;
});
