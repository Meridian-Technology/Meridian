const { DesignCanvas, DCSection, DCArtboard } = window;

function App() {
  return (
    <DesignCanvas
      title="EventDashboard · across the lifecycle"
      subtitle="Four state-specific dashboard designs: just-created, preparing, live, concluded. The dashboard becomes a different product at each stage."
    >
      <DCSection id="diagnosis" title="Diagnosis">
        <DCArtboard id="diagnosis" label="Four states · why one dashboard isn't enough" width={1240} height={780}>
          <Diagnosis/>
        </DCArtboard>
      </DCSection>

      <DCSection id="states" title="State by state">
        <DCArtboard id="state-1" label="01 — Just created · empty event" width={1440} height={980}>
          <StateCreated/>
        </DCArtboard>
        <DCArtboard id="state-2" label="02 — Preparing · 11 days out" width={1440} height={980}>
          <StatePreparing/>
        </DCArtboard>
        <DCArtboard id="state-3" label="03 — Live · day-of, in progress" width={1440} height={980}>
          <StateLive/>
        </DCArtboard>
        <DCArtboard id="state-4" label="04 — Concluded · post-mortem" width={1440} height={980}>
          <StateConcluded/>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
