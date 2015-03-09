/*---------------------------------------------------------
 * OpenERP Web Boostrap Code
 *---------------------------------------------------------*/

/**
 * @name openerp
 * @namespace openerp
 */

(function() {
    "use strict";

    var jobs = [],
        factories = Object.create(null),
        job_names = [],
        job_deps = [];

    var services = Object.create({
        qweb: new QWeb2.Engine(),
        $: $,
        _: _,
    });

    var debug = ($.deparam($.param.querystring()).debug !== undefined);

    var odoo = window.odoo = {
        testing: typeof QUnit === "object",
        debug: debug,

        __DEBUG__: {
            get_dependencies: function (name, transitive) {
                var deps = name instanceof Array ? name: [name],
                    changed;
                do {
                    changed = false;
                    _.each(job_deps, function (dep) {
                        if (_.contains(deps, dep.to) && (!_.contains(deps, dep.from))) {
                            deps.push(dep.from);
                            changed = true;
                        }
                    });
                } while (changed && transitive)
                return deps;
            },
            get_dependents: function (name) {
                return _.pluck(_.where(job_deps, {from: name}), 'to');            
            },
            factories: factories,
            services: services,
        },
        define: function () {
            var args = Array.prototype.slice.call(arguments),
                name = typeof args[0] === 'string' ? args.shift() : _.uniqueId('__job'),
                deps = args[0] instanceof Array ? args.shift() : [],
                factory = args[0];

            if (odoo.debug) {
                if (!(deps instanceof Array)) {
                    throw new Error ('Dependencies should be defined by an array', deps);
                }
                if (typeof factory !== 'function') {
                    throw new Error ('Factory should be defined by a function', factory);
                }
                if (typeof name !== 'string') {
                    throw new Error("Invalid name definition (should be a string", name);
                }            
                if (name in factories) {
                    throw new Error("Service " + name + " already defined");                
                }
            }
            
            factory.deps = deps;
            factories[name] = factory;

            jobs.push({
                name: name,
                factory: factory,
                deps: deps,
            });

            job_names.push(name);
            _.each(deps, function (dep) {
                job_deps.push({from:dep, to:name});
            });

            if (!this.testing) {
                this.process_jobs(jobs, services);
            }
        },
        init: function () {
            odoo.__DEBUG__.remaining_jobs = jobs;
            odoo.__DEBUG__.web_client = services['web.web_client'];

            if (jobs.length) {
                console.warn('Warning: not all jobs could be started.', jobs);
            }
            // _.each(factories, function (value, key) {
            //     delete factories[key];
            // });
        },
        process_jobs: function (jobs, services) {
            var job, require;
            while (jobs.length && (job = _.find(jobs, is_ready))) {
                require = make_require(job);

                services[job.name] = job.factory.call(null, require);
                if (require.__require_calls !== job.deps.length) {
                    console.warn('Job ' + job.name + ' did not require all its dependencies');
                }
                jobs.splice(jobs.indexOf(job), 1);
            }
            return services;

            function is_ready (job) {
                return _.every(job.factory.deps, function (name) { return name in services; });
            }

            function make_require (job) {
                var deps = _.pick(services, job.deps);

                function require (name) {
                    if (!(name in deps)) {
                        console.error('Undefined dependency: ', name);
                    } else {
                        require.__require_calls++;
                    }
                    return deps[name];
                }

                require.__require_calls = 0;
                return require;
            }
        }
    };

})();
