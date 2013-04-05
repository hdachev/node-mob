


/**

    DO NOT USE THIS IN PRODUCTION, it's totally unsafe.
    If you want to experiment with it, pass a `quarantine:true` option in a role() definition.

 **/


    ////    This is the quarantine block.
    ////    @@ will get replaced by the file:line:char of the original error.

var fs = require ( 'fs' ),
    QUARANTINE = fs.readFileSync ( __dirname + '/quarantine.block.js', 'utf8' ),
    SEARCH = QUARANTINE.substr ( 0, QUARANTINE.indexOf ( '@@' ) );


    ////    Apply the quarantine to this stack trace.

module.exports = function ( stack, allowable )
{

        ////    Rewrite sources only if explicitly allowed by the environment.

    if ( !process.env.ALLOW_QUARANTINE )
    {
        process.stderr.write ( '\033[1;31mQUARANTINE NOT ALLOWED BY THE ENVIRONMENT.\033[0m\n' );
        return false;
    }

    else
        process.stderr.write ( '\033[1;33mATTEMPTING QUARANTINE ...\033[0m\n' );


        ////

    var pattern = /\n +at +[^\n]*?(([\\\/a-zA-Z0-9._-]+):([0-9]+):([0-9]+))/g,
        matches, source, head, len, x, y;

    while(( matches = pattern.exec( stack ) )) {
        process.stderr.write ( '\033[1;33m' + matches [ 2 ] + ' ...\033[0m\n' );

        // never put external dependencies under quarantine
        if( matches[ 2 ].indexOf( 'node_modules' ) >= 0 )
            process.stderr.write( '\033[1;31mQUARANTINE FAILS (TYPE A1).\033[0m\n' );

        // use a regexp or other user provided test to narrow down the places where a quarnatine is allowable
        else if( allowable && typeof allowable.test === 'function' && !allowable.test( matches[ 2 ] ) )
            process.stderr.write( '\033[1;31mQUARANTINE FAILS (USER FILENAME TEST).\033[0m\n' );

        else try
        {
            source = fs.readFileSync ( matches [ 2 ], 'utf8' );
            head = substrLineCol ( source, Number ( matches [ 3 ] ), Number ( matches [ 4 ] ) );
            len = head.length;

                ////    Do not apply the quarantine to a function that explictily throws this error.

            if ( !/throw\s*$/.test ( head ) && len > 0 && ( x = findFunctionStart ( head ) ) > 0 )
            {
                x ++;

                    ////    Another process might have already applied a quarantine here.

                if ( ( y = source.indexOf ( SEARCH, x ) ) >= 0 && y <= len )
                {
                    process.stderr.write ( '\033[1;32mQUARANTINE ALREADY IN PLACE.\033[0m\n' );
                    return matches [ 1 ];
                }

                    ////    Rewrite the .js file inserting the quarantine block.

                fs.writeFileSync
                (
                    matches [ 2 ],
                    head.substr ( 0, x ) + QUARANTINE.replace ( '@@', matches [ 1 ] ) + head.substr ( x ) + source.substr ( len ),
                    'utf8'
                );

                    ////    Only need to do this once.

                process.stderr.write ( '\033[1;32mQUARANTINE SUCCESSFUL.\033[0m\n' );
                return matches [ 1 ];
            }
        }
        catch ( e )
        {
            process.stderr.write ( e.stack + '\n' );
        }
    }


        ////    Fail.

    process.stderr.write ( '\033[1;31mQUARANTINE FAILS (TYPE A2).\033[0m\n' );
    return false;
};


    ////    substr ( 0, line:col ).

function substrLineCol ( string, line, col )
{
    var lines = string.split ( '\n' ).slice ( 0, line );
    lines [ lines.length - 1 ] = lines [ lines.length - 1 ].substr ( 0, col - 1 );
    return lines.join ( '\n' );
}


    ////    Very crude:
    ////      - doesn't handle escaped backslashes within string literals;
    ////      - doesn't handle comments.

function findFunctionStart ( source, c )
{
    var x = source.length, chr, l = -1, str = '';

    if ( !c )
        c = 0;

    while ( x > 0 )
    {
        x --;
        chr = source.charAt ( x );

        if ( str )
        {
            if ( chr === str && source.charAt ( x - 1 ) !== '\\' )
                str = '';
        }

        else if ( chr === '}' )
        {
            c ++;
            l = -1;
        }

        else if ( chr === '{' )
        {
            c --;
            l = x;
        }

        else if ( chr === '"' )
            str = '"';

        else if ( chr === "'" )
            str = "'";

        else if ( chr === 'n' && c < 0 && l >= 0 && source.substr ( x - 7, 8 ) === 'function' )
            return l + 1;
    }
}




