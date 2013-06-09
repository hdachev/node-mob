

    ////

var EventEmitter = require ( 'events' ).EventEmitter,
    cluster = require ( 'cluster' );

if ( !cluster.isMaster || cluster.isWorker )
    throw new Error ( "Not master." );


    ////

function Kingpin ()
{
    var self = this,
        mobName = 'mob',
        roles = {},
        exports = {},
        full = false;


        ////    Forking, message routing and revival.

    function send ( obj, handle, filter, count )
    {
        var name, workers,
            i, n, worker;

        if ( !obj )     throw new Error ( "Falsy message." );
        if ( !roles )   throw new Error ( "Falsy roles." );
        if ( !count )   throw new Error ( "Falsy count." );

            ////    Message by pid.

        if ( filter && typeof filter === 'number' )
        {
            for ( name in roles )
            {
                workers = roles [ name ].workers;
                n = workers.length;
                for ( i = 0; i < n; i ++ )
                {
                    worker = workers [ i ];
                    if ( ( worker.pid || worker.process.pid ) === filter )
                    {
                        try
                        {
                            worker.send ( obj, handle );
                        }
                        catch ( e )
                        {
                            worker.kill ();
                        }

                        return;
                    }
                }
            }
        }

            ////    Message by role type.

        else
            for ( name in roles )
                if ( !filter || filter === name )
                {
                    workers = roles [ name ].workers;
                    n = workers.length;

                    if ( n > 1 )
                        workers.unshift ( workers.pop () );

                    for ( i = 0; i < n && i < count; i ++ )
                    {
                        worker = workers [ i ];

                        if ( worker.ready )
                        {
                            try
                            {
                                worker.send ( obj, handle );
                            }
                            catch ( e )
                            {
                                worker.kill ();
                            }

                            count --;
                            if ( count < 0 )
                                return;
                        }
                    }
                }
    }

    function fork ()
    {
        var worker,
            name, role;

        for ( name in roles )
        {
            role = roles [ name ];
            if ( role.workers.length < role.num ) break;
            role = null;
        }

        if ( !role )
        {
            if ( !full )
                self.emit ( 'full' );

            full = true;
        }
        else
        {
            worker = cluster.fork ();
            worker.role = role;
            worker.time = Date.now ();

            role.workers.push ( worker );

            worker.on ( 'message', function ( msg, handle )
            {
                if ( !msg )
                    return;

                if ( msg.MOB === 'JOIN' )
                    try
                    {
                        worker.send
                        ({
                            MOB     : 'ROLE',
                            name    : mobName,
                            role    : worker.role.name,
                            exports : exports
                        });
                    }
                    catch ( e )
                    {
                        worker.kill ();
                    }

                else if ( msg.MOB === 'ROLE' )
                {
                    if ( msg.path !== worker.role.path )
                        throw new Error ( "Worker `" + worker.role.name + "` reports requiring the wrong path `" + msg.path + "`." );

                    worker.ready = true;
                    fork ();
                }

                else if ( msg.MOB === 'SCALE' )
                {
                    if ( msg.incr < 0 )
                    {
                        if ( worker.role.num > worker.role.min )
                        {
                            worker.role.num --;
                            worker.kill ();
                        }
                    }

                    else if ( worker.role.num < worker.role.max )
                    {
                        worker.role.num ++;
                        full = false;
                        fork ();
                    }
                }

                else if ( msg.MOB === 'EXPORT' )
                {
                    if ( !exports [ worker.role.name ] )
                        exports [ worker.role.name ] = msg.methods;
                }

                else if ( msg.MOB === 'MESSAGE' )
                    send ( msg.msg, handle, msg.filter, msg.count );

                else
                    self.emit ( 'message', msg );
            });

            worker.on( 'exit', function( code, signal ) {
                console.log( "Worker `" + worker.role.name + "` exits with code `" + code + "`, signal `" + signal + "`." );
                self.onDeath( worker );
            });
        }

        return self;
    }

    self.onDeath = function( worker ) {
        var role = worker.role, x;
        if ( !role )
            return;

        x = worker.role.workers && worker.role.workers.indexOf ( worker );
        if ( x >= 0 )
        {
            worker.role.workers.splice ( x, 1 );
            worker.role.dead ++;
            full = false;
            fork ();
        }

        delete worker.role;
        self.emit ( 'death', role.name, role.dead, worker );
    };

    cluster.on( 'death', self.onDeath );


        ////    API.

    self.base = function ()
    {
        return self;
    };

    self.role = function ( name, path, options )
    {
        if ( roles [ name ] )
            throw new Error ( "'" + name + "' exists already." );
        if ( /[^a-zA-Z0-9_.-]/.test ( name ) )
            throw new Error ( "Bad characters in role name - '" + name + "'" );

        if ( !options )
            options = {};

        roles [ name ] =
        {
            name : name, path : path,
            workers : [],
            min : options.minWorkers || options.workers || 1,
            max : options.maxWorkers || options.workers || 1,
            dead : 0
        };

        roles [ name ].num = roles [ name ].min;
        return self;
    };

    self.start = function ( name )
    {
        delete self.start;

        mobName = name || 'mob';
        process.title = mobName + ' (kingpin)';
        process.nextTick ( fork );
        return self;
    };


        ////    Disabled on kingpin.

    self.any = self.pid = self.all = self.require = self.lastErr = function ()
    {
        throw new Error ( "Method not available on Kingpins. You should put all your application logic in Mobsters!" );
    };


        ////    Ignore EPIPE errors on all channels.
        ////        These can occur randomly when the kingpin process gets overburdened,
        ////        as children might have died when kingpin attempts to pass a message,
        ////        as the event loop is lagging behind and still hasn't fired all death events.

    process.on ( 'uncaughtException', function ( err )
    {
        // if ( err.code === 'EPIPE' )
            // process.stderr.write ( "\033[1;31mIgnoring uncaught EPIPE exception in Kingpin:\033[0m\n" + err.stack + "\n" );

        // else
        // {
            process.stderr.write ( "\033[1;31mCLUSTER CRASHES!\nUncaught exception in Kingpin:\033[0m\n" + err.stack + "\n" );
            process.exit ( 1 );
        // }
    });


        ////    Events.

    EventEmitter.call ( this );
}

Kingpin.prototype = EventEmitter.prototype;


    ////

module.exports = new Kingpin;
