import './SettingsList.scss'

const SettingsList = ({ items }) => {
    return(
        <div className="settings-list">
            {items?.map(item=>(
                <div className="setting-child" key={item.title}>
                    <div className="content">
                        <h4>{item.title}</h4>
                        <p>{item.subtitle}</p>
                    </div>
                    {
                        item.action &&
                        <div className="action">
                            {item.action}
                        </div>
                    }
                </div>
            ))}
        </div>
    )
}; 

export default SettingsList;
