import React, {useState, useEffect} from 'react';
import './SiteHealth.scss';
import { useFetch } from '../../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import PulseDot from '../../../../components/Interface/PulseDot/PulseDot';
import AnimatedNumber from '../../../../components/Interface/AnimatedNumber/AnimatedNumber';

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
  
    return [
      d > 0 ? `${d}d` : null,
      h > 0 ? `${h}h` : null,
      m > 0 ? `${m}m` : null,
      `${s}s`
    ].filter(Boolean).join(' ');
}

const SiteHealth = ({}) => {
    const health = useFetch('/health');

    const [good, setGood] = useState(true);
    const [showDetailed, setShowDetailed] = useState(false);

    useEffect(()=>{
        if(health.data){
            Object.keys(health.data.statuses).map((obj) => {
                if(health.data.statuses[obj].status != true){     
                    setGood(false);
                }
            })
            setTimeout(() => {
                if(showDetailed){
                    health.refetch();
                }
            }, 1500);
        }
    }, [health.data]);

    if(!health.data){
        return(
            <div className="site-health">loading</div>
        )
    }

    return(
            <div className="site-health">
                {
                    good ? 
                    <div className="status good">
                        <div className="status-text">
                            <div className="operational">
                                <PulseDot color="var(--green)" size="10px" pulse={true}/>   
                            </div>
                            <h2>
                                {health.data.subDomain}.meridian.study
                            </h2>
                        </div>
                        <div className="tag" onClick={() => setShowDetailed(!showDetailed)}>
                            <Icon icon="icon-park-solid:check-one" />
                            <p>all systems operational</p>
                        </div>
                    </div>
                    :
                    <div className="status problem">
                        <div className="operational">
                            <PulseDot color="var(--red)" size="10px" pulse={true}/>   
                        </div>
                        <h2>
                            {health.data.subDomain}.meridian.study
                        </h2>
                    </div>
                }
                <div className={`health-stats${showDetailed ? '' :' collapsed'}`}>
                    <div className="health-stats-item">
                        <div className="row">
                            <div className="tag">
                                <p>
                                    ok
                                </p>
                            </div>
                            <Icon icon="mingcute:time-fill" />
                            <p>uptime</p>
                            <p className="stat"><b>{formatUptime(health.data.statuses.backend.uptime)}</b></p>
                        </div>
                    </div>
                    <div className="health-stats-item">
                        <div className="row">
                            <div className="tag">
                                <p>
                                    {health.data.statuses.database.status ? 'ok' : 'problem'}
                                </p>
                            </div>
                            <Icon icon="material-symbols-light:database" />
                            <p>database</p>
                            <p className="stat">latency: <b><AnimatedNumber value={parseFloat(health.data.statuses.database.latency)} /></b>ms</p>

                        </div>
                    </div>
                    <div className="health-stats-item">
                        <div className="row">
                            <div className="tag">
                                <p>
                                    {health.data.statuses.database.status ? 'ok' : 'problem'}
                                </p>
                            </div>
                            <Icon icon="material-symbols:security-rounded" />
                            <p>authorization</p>
                        </div>
                    </div>
                </div>
            </div>
    )
}

export default SiteHealth;