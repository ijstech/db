const Mysql = require('mysql');
var Options = {};

function getConnection(dbName){
    if (Options[dbName]){
        if (Options[dbName].type == 'mysql')
            return Mysql.createConnection(Options[dbName]);   
    }
    else {
        let opt = Options.$$default;
        if (opt){
            if (opt.type == 'mysql')
                return Mysql.createConnection({
                    host: opt.host,
                    port: opt.port,
                    password: opt.password,
                    user: dbName,
                    database: dbName
                });   
        }    
    }    
}
function query(dbName, sql, params){
    return new Promise(function(resolve, reject){
        let connection = getConnection(dbName);
        if (connection){
            try{
                connection.query(sql, params, function(err, result){
                    if (err)
                        reject(err)
                    else
                        resolve(result);
                })
            }
            finally{
                connection.end();
            }
        }    
        else
            reject('$db_not_defined')
    })
}
function getServerType(dbName){
    let opt = Options.$$default;
    if (opt){
        return opt.type
    }  
}
module.exports = {
    _init: function(options){
        Options = options;        
    },    
    _plugin: async function(vm, ctx, site){
        let self = this;        
        let connections = {};        
        function getConnection(db){
            let dbConfig;
            if (db){
                if ((Array.isArray(site.db) && site.db.indexOf(db) > -1) || site.db == db)
                    dbConfig = Options[db]
            }
            else if (ctx){
                db = ctx.package.db[0] || site.db[0]
                dbConfig = Options[db];
            }
            else if (site && site.database){
                db = site.database;
                dbConfig = Options[db];                
            }            
            if (dbConfig){
                if (connections[db])
                    return connections[db]
                else{
                    let connection = Mysql.createConnection(dbConfig);   	
                    connections[db] = connection;
                    return connection;
                }
            }
        }
        function releaseConnections(){
            for (let v in connections){
                try{
                    connections[v].end();
                }
                catch(err){}
                delete connections[v];
            }            
        }
        function releaseConnection(name){            
            if (connections[name]){
                try{
                    connections[name].end();
                }
                catch(err){}
                delete connections[name];
            }
            else if (!name)
                releaseConnections();
        };        
        vm.on('destroy', function(){
            releaseConnections()
        });          
        vm.injectGlobalObject('_$$plugin_db', {
            $$query: true,
            query: async function(db, sql, params){
                return new Promise(function(resolve, reject){                    
                    let connection = getConnection(db);
                    if (connection){
                        connection.query(sql, params, function(err, result){
                            if (err){                                
                                reject(err)
                            }
                            else
                                resolve(JSON.stringify(result))
                        })
                    }     
                    else
                        reject('$database_not_defined');
                })        
            },
            $$beginTransaction: true,
            beginTransaction: function(db){
                return new Promise(function(resolve, reject){
                    let connection = getConnection(db);
                    connection.beginTransaction(function(err){
                        if (err)
                            reject(err)
                        else
                            resolve()
                    })	
                })
            },
            $$commit: true,
            commit: function(db){
                return new Promise(function(resolve, reject){
                    let connection = getConnection(db);
                    connection.commit(function(err){                        
                        if (err)
                            reject(err)
                        else
                            resolve()
                    })	
                })
            },
            $$rollback: true,
            rollback: function(db){
                return new Promise(function(resolve, reject){
                    let connection = getConnection(db);
                    connection.rollback(function(err){                        
                        if (err)
                            reject(err)
                        else
                            resolve()
                    })	
                })
            }
        }, ''+ function init(){
            global.Plugins.db = {
                getConnection: function(name){
                    return {
                        query: async function(sql, params){
                            let result = await _$$plugin_db.query(name, sql, params);
                            return JSON.parse(result);              
                        },
                        beginTransaction: function(){
                            return _$$plugin_db.beginTransaction(name);
                        },
                        commit: function(){
                            return _$$plugin_db.commit(name);
                        },
                        rollback: function(){
                            return _$$plugin_db.rollback(name);
                        }
                    }
                }                
            };
        } + ';init()')
    },
    getDatabase: function(name){        
        return Options[name];
    },
    query: query,
    getConnection: getConnection,
    getServerType: getServerType
}