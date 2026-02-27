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

    const statuses = health.data?.statuses;
    const hasDetailedStatus = statuses && typeof statuses === 'object';

    useEffect(()=>{
        if(health.data && hasDetailedStatus){
            Object.keys(health.data.statuses).map((obj) => {
                if(health.data.statuses[obj].status != true){
                    setGood(false);
                }
            });
        } else if(health.data && !health.data.ok){
            setGood(false);
        }
        setTimeout(() => {
            if(showDetailed && health.refetch){
                health.refetch();
            }
        }, 1500);
    }, [health.data, hasDetailedStatus, showDetailed]);

    if(!health.data){
        return(
            <div className="site-health">loading</div>
        )
    }

    const subDomain = health.data.subDomain || 'www';

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
                                {subDomain}.meridian.study
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
                            {subDomain}.meridian.study
                        </h2>
                    </div>
                }
                <div className={`health-stats${showDetailed ? '' :' collapsed'}`}>
                    <div className="health-stats-item">
                        <div className="row">
                            <div className="tag">
                                <p>ok</p>
                            </div>
                            <Icon icon="mingcute:time-fill" />
                            <p>uptime</p>
                            <p className="stat"><b>{hasDetailedStatus && statuses.backend?.uptime != null ? formatUptime(statuses.backend.uptime) : '—'}</b></p>
                        </div>
                    </div>
                    <div className="health-stats-item">
                        <div className="row">
                            <div className="tag">
                                <p>{hasDetailedStatus && statuses.database ? (statuses.database.status ? 'ok' : 'problem') : 'ok'}</p>
                            </div>
                            <Icon icon="material-symbols-light:database" />
                            <p>database</p>
                            <p className="stat">latency: <b>{hasDetailedStatus && statuses.database?.latency != null ? <><AnimatedNumber value={parseFloat(statuses.database.latency)} /> ms</> : '—'}</b></p>
                        </div>
                    </div>
                    <div className="health-stats-item">
                        <div className="row">
                            <div className="tag">
                                <p>{hasDetailedStatus && statuses.database ? (statuses.database.status ? 'ok' : 'problem') : 'ok'}</p>
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