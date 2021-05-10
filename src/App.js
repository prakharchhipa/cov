/* eslint-disable array-callback-return */
import "./App.css";
// import { Notifications } from "react-push-notification";
import { Button, Col, Input, Row, Radio, Select, Checkbox, Tabs, Modal, Typography } from "antd";
import { CloseCircleOutlined } from "@ant-design/icons";
import React from "react";
import CowinApi from "./models";

import moment from "moment";
import {
  FacebookShareButton,
  WhatsappShareButton,
  TwitterShareButton,
  LinkedinShareButton,
  TelegramShareButton,
  RedditShareButton,
  FacebookIcon,
  LinkedinIcon,
  WhatsappIcon,
  TwitterIcon,
  RedditIcon,
  TelegramIcon

} from "react-share"
const { Text } = Typography;
const { TabPane } = Tabs;
const cowinApi = new CowinApi();
const { Search } = Input;
const { Option } = Select;       

const promosg = {
  text: 'Use this link to track vaccine availability and automatically book a slot for you and your family.',
  title: 'Automated vaccine booking and availability tracking',
  tags: ['covid19vaccines', 'covid19help', 'vaccination2021', 'covid19india'],
  url: window.location.href.indexOf('localhost') ? 'https://yashwanthm.github.io/cowin-vaccine-booking/' : window.location.href
}

const metas = document.getElementsByTagName("meta");
const version = metas[metas.length-1].getAttribute("build-version");

class App extends React.Component{
  constructor(props) {
    super(props);
    this.bookingIntervals=[];
    setInterval(() => {
      this.bookingIntervals.map(b=>{
        clearInterval(b)
      })
    }, 1000);
    let state = {
      isWatchingAvailability: false,
      vaccineType: 'ANY',
      bookingInProgress: false,
      isAuthenticated: localStorage.token ? true : false,
      minAge: 18,
      districtId: null,
      stateId: null,
      beneficiaries: [],
      selectedBeneficiaries: [],
      otpData: {
        txnId: null
      },
      vaccineCalendar: {},
      zip: null,
      enableOtp: false,
      otp: null,
      mobile: null,
      token: localStorage.token || null,
      selectedTab: "1",
      dates: [],
      states: [],
      dose: 1,
      districs: [],
      session: null,
      bookingCenter: null,
      showSuccessModal: false
    };
    if(localStorage.appData){
      state = Object.assign(state, JSON.parse(localStorage.appData))
    } 
    if(localStorage.token){
      state.token = localStorage.token;
      state.isAuthenticated = true;
    }
    this.state = state;
  }
  async waitForOtp(){

    console.log('waiting for otp');
    if(this.ac){
      this.ac.abort();
    }
    if ('OTPCredential' in window) {
      
      console.log('Waiting for SMS. Try sending yourself a following message:\n\n' +
          'Your verification code is: 123ABC\n\n' +
          '@whatwebcando.today #123ABC');

          try {
            this.ac = new AbortController();
            const theotp = await navigator.credentials.get({
              otp: { transport:['sms'] },
              signal: this.ac.signal
            }).then(otp => {
              console.log('otp is ', otp);
              console.log(`otp, ${otp}`);
              this.setState({otp});
            }).catch(err => {
              console.log(`ssss ${err}`);
            });  
            console.log(theotp);
          } catch (error) {
            console.log(error);
          }
          
    } else {
      console.log('Web OTP API not supported');
    }
      
  }
  getBeneficiaries(){
    // console.log('get bens');
    cowinApi.getBenefeciaries(this.state.token).then(data=>{
      this.setState({beneficiaries: data},()=>{this.setStorage()});
    }).catch(err=>{
      console.log(err);
      delete localStorage.token;
      this.setState({isAuthenticated: false, token: null, enableOtp: false},()=>{
        if(this.state.mobile){
          // this.generateOtp()
        }
      })
    })
  }
  speak(msg){
    try {
      let speech = new SpeechSynthesisUtterance();

      speech.lang = "en-UK";
      speech.volume = 1;
      speech.rate = 1;
      speech.pitch = 1; 
      speech.text = msg;
      window.speechSynthesis.speak(speech);  
    } catch (error) {
      console.log(error);
    }
    

  }
  componentDidMount(){
    let token = localStorage.token || this.state.token;
    if(token){
      this.getBeneficiaries();
      this.trackAuth(token);
    }

    cowinApi.getStates().then(data=>{
      this.setState({states: data.states},()=>{
        this.selectState(this.state.stateId);
        this.selectDistrict(this.state.districtId);
      })
    }).catch(err=>{
      console.log(err);
    })
    
    // const self = this;  
    try {
      Notification.requestPermission((status) => {
        console.log("Notification permission status:", status);
      });  
    } catch (error) {
      console.log(error);
    }  
    

    this.notifSound = document.getElementById("notif");

    try {
      // this.notifSound.play();  
    } catch (error) {
      console.log(error)
    }
      let opts = {
        title: "Vaccine Notifications Enabled",
        body: `You now have notifications active for Covid vaccine availability`,
        native: true,
        vibrate: [300, 100, 400]
      };
      try {
        Notification.requestPermission(function(result) {
          if (result === 'granted') {
            navigator.serviceWorker.ready.then(function(registration) {
              registration.showNotification(opts.title, opts);
            });
          }
        });
        new Notification(opts.title, opts);  
      } catch (error) {
        console.log(error);
      }
  }
  setStorage(){
    let state = Object.assign({}, this.state)
    delete state.enableOtp;
    delete state.vaccineCalendar;
    delete state.isWatchingAvailability;
    localStorage.appData = JSON.stringify(state);
  }
  componentWillUnmount() {
    // unsubscribe to ensure no memory leaks
    this.setStorage();
    if(this.watcher) this.watcher.unsubscribe();
  }
  handleNotification(){
    let centers = this.state.vaccineCalendar.centers;
    let requiredNums = 1;
    if(this.state.selectedBeneficiaries && Array.isArray(this.state.selectedBeneficiaries) && this.state.selectedBeneficiaries.length>0){
      requiredNums = this.state.selectedBeneficiaries.length;
    }
    centers.map(c=>{
      c.sessions.map(s=>{
        
        if (
          parseInt(s.min_age_limit) === this.state.minAge &&
          parseInt(s.available_capacity) >= requiredNums && 
          !this.state.bookingInProgress
        ) {

          let vt = this.state.vaccineType;
          if(vt !== 'ANY' && vt!== s.vaccine){
            return;
          }
          
          try {
            // this.notifSound.play();  
          } catch (error) {
            
          }

          let opts = {
            title: c.name,
            body: `${c.pincode} ${c.address} has ${s.available_capacity} on ${s.date}`,
            vibrate: [300, 100, 400],
            native: true
          }
          try {
            Notification.requestPermission(function(result) {
              if (result === 'granted') {
                navigator.serviceWorker.ready.then(function(registration) {
                  registration.showNotification(opts.message, opts);
                });
              }
            });
            new Notification(opts.title, opts);    
            
            this.speak(`Vaccines available at ${c.name}`);
            if(this.state.isAuthenticated){
              this.setState({bookingInProgress: true},()=>{
                this.book(s, c);
              })
            }else{
              // this.generateOtp();
            }
            
            
          } catch (error) {
            console.log(error);
          }
          
          
        }
      })
    })
  }
  async book(session, center){
    let benIds = [];
    await this.setState({bookingSession: session, bookingCenter: center});
    if(this.state.selectedBeneficiaries.length === 0){
      if(!this.state.isAuthenticated){
        this.setState({enableOtp: true},()=>{
          this.generateOtp()
        })
      }
      return;
    }else{
      this.state.selectedBeneficiaries.map(sb=>{
        benIds.push(sb.beneficiary_reference_id)
      })
    }
    
    
    let payload = {
      dose: this.state.dose ? parseInt(this.state.dose) : 1,
      session_id: session.session_id,
      slot: session.slots[0],
      beneficiaries: benIds
    }
    // let thisInterval = setInterval(()=>{
      cowinApi.book(payload, this.state.token).then(data=>{
        console.log('Booking success ', data.appointment_id);
        this.clearWatch();
        this.setState({bookingInProgress: false, appointment_id: data.appointment_id, showSuccessModal: true});
      }).catch(err=>{
        this.setState({bookingInProgress: false, session: null, bookingCenter: null});
        let msg = 'Booking did not get through, tracking for next slot';
        // this.speak(msg);
        console.log(msg);
      })  
    // }, 100)
    // if(!this.bookingIntervals){
    //   this.bookingIntervals = [];
    // }
    // this.bookingIntervals.push(thisInterval);
  }

  initWatch(zip) {
    const self = this;

    this.setStorage();
    this.setState({isWatchingAvailability: true});
    if(this.state.selectedTab === "1"){
      this.watcher = cowinApi
      .initDist(this.state.districtId, moment().format("DD-MM-YYYY"))
      .subscribe({
        next(data) {
          self.setState({vaccineCalendar: data},()=>{
            self.handleNotification();
            // self.setStorage()
          })
        },
        error(err) {
          console.error("something wrong occurred: " + err);
        },
        complete() {
          console.log("done");
          this.setState({ isWatchingAvailability: false });
        },
      });
    }else{
      this.watcher = cowinApi
      .init(this.state.zip, moment().format("DD-MM-YYYY"))
      .subscribe({
        next(data) {
          self.setState({vaccineCalendar: data},()=>{
            self.handleNotification();
            self.setStorage()
          })
        },
        error(err) {
          console.error("something wrong occurred: " + err);
        },
        complete() {
          console.log("done");
          this.setState({ isWatchingAvailability: false });
        },
      });
    }
    
  }
  trackAuth() {
    const self = this;
    console.log('trackauth');
    if(this.state.isAuthenticated===false) return;
    this.authWatch = cowinApi
      .trackAuth(this.state.token)
      .subscribe({
        next(data) {
          // console.log({sdata: data})
          if(Array.isArray(data)){
            self.setState({beneficiaries: data})
          }else{
            console.log('asasad');
            cowinApi.clearAuthWatch();
            delete localStorage.token;
            self.setState({isAuthenticated: false, token: null},()=>{
              
              if(self.state.isWatchingAvailability){
                self.generateOtp();
                self.speak('Session expired!');
              }
              
            })
          }
          
        },
        error(err) {
          console.error("something wrong occurred: " + err);
          self.speak('Session expired!');
          cowinApi.clearAuthWatch();
          delete localStorage.token;
          self.setState({isAuthenticated: false, token: null},()=>{
            if(self.state.isWatchingAvailability && !self.state.enableOtp){
              self.generateOtp();
              
              self.speak('Session expired!');
            }
          })
        },
        complete() {
          console.log("done");
          self.setState({ isWatchingAvailability: false });
        },
      });
  }
  clearWatch() {
    cowinApi.clearWatch();
    this.setState({ isWatchingAvailability: false });
  }
  renderTable(vaccineCalendar){
    return (
      <div>
        <h2 style={{ marginTop: 10 }}>Vaccination Centers & Availability Info</h2>
        <table style={{ marginTop: 10 }}>
          {vaccineCalendar.centers.map((vc) => {
            let noAvailability = true;
            vc.sessions.map((ss) => {
              // eslint-disable-next-line no-unused-vars
              if (ss.available_capacity > 0) noAvailability = false;
            });

            return (
              <tr key={vc.center_id}>
                <td>
                  <h3>{vc.name}</h3>
                  {vc.block_name}, {vc.address}, {vc.pincode}
                </td>

                {false ? (
                  <td>No Availability</td>
                ) : (
                  vc.sessions.map((s) => {
                    return (
                      <td key={s.session_id}>
                        <h4>{s.date}</h4>
                        <p>{s.vaccine}</p>
                        <div>
                          {parseInt(s.available_capacity) > 0
                            ? `${s.available_capacity} shots available for ${s.min_age_limit}+`
                            : `No Availability ${s.min_age_limit}`}
                        </div>
                        {parseInt(s.available_capacity > 0) ? (
                          <div>
                            <b>Available Slots</b>
                            {s.slots.map((sl) => {
                              return <Row>{sl}</Row>;
                            })}
                          </div>
                        ) : null}
                      </td>
                    );
                  })
                )}

                {/* </th> */}
              </tr>
            );
          })}
        </table>
      </div>
    );
      
  }
  setMinAge(e){
    this.setState({minAge: e.target.value});
  }
  generateOtp(){
    
    this.setState({enableOtp: true}, ()=>{
      cowinApi.generateOtp(this.state.mobile).then(data=>{
        // console.log(data);
        this.speak("One Time Password has been sent to your phone. Please enter.");
        // this.notifSound.play();  
        this.setState({otpData: data, enableOtp: true});
        // this.waitForOtp();
      }).catch(err=>{
        console.log(err);
        this.setState({enableOtp: false})
      })
    });
    
  }
  verifyOtp(){
    cowinApi.verifyOtp(this.state.otp, this.state.otpData.txnId).then(data=>{
      // console.log('otp verify ', data);
      localStorage.token = data.token;
      this.setState({token: data.token, isAuthenticated: true, enableOtp: false}, ()=>{
        this.setStorage();
        this.getBeneficiaries();
        this.trackAuth(data.token);
      })
    }).catch(err=>{
      console.log(err);
      if(this.state.isAuthenticated){
        delete localStorage.appData;
        delete localStorage.token;
        this.setState({token: null, isAuthenticated: false});
      }
    })
  }
  selectState(stateId){
    this.setState({stateId}, ()=>{
      cowinApi.getDistricts(stateId).then(data=>{
        this.setState({districs: data});
      }).catch(err=>{
        console.log(err)
      })
    })
  }
  selectDistrict(districtId){
    this.setState({districtId}, ()=>{
    })
  }
  render() {
    const vaccineCalendar = this.state.vaccineCalendar;
    const isAuthenticated = this.state.isAuthenticated;
    const {beneficiaries, selectedBeneficiaries} = this.state;
    return (
      <div className="App">
        {/* <Notifications /> */}
        <audio id="notif">
          <source src="https://assets.coderrocketfuel.com/pomodoro-times-up.mp3"></source>
        </audio>
        <header className="App-header">
          <h2>
          Covid-19 automatic vaccine bookings and notifications for availability.
          </h2>
          <p>
            This web-app can continously tracks for availability of vaccine and
            proceed with booking on your behalf if you are logged in.
          </p>
          <p style={{ color: "#555" }}>
            Please register on{" "}
            <a
              href="https://www.cowin.gov.in/home"
              target="_blank"
              rel="noreferrer"
            >
              Cowin
            </a>{", "}
            add beneficiaries and then, come back here.
            <br />
            Login and select beneficiaries to enable automatic booking.
            <br />
            If you do not get the OTP for more than 2 mins, please refresh and
            start over. When the load is high, OTP generation fails. Please bear
            with it. You can choose to track notifications only. Simply proceed with tracking without logging in.
            <br/>
            *Please be careful with the location selection as the booking can automatically happen at any center that has availability.
            <br/>
            **Availability is very short. Please keep feeding in OTPs when the session expires to book as soon as there's availability.
          </p>
        </header>

        {/* <Col style={{ marginBottom: 10 }}>
          {this.state.isWatchingAvailability ? null : (
            <title>Select age group for getting notifications</title>
          )}
        </Col> */}
        <Row >
          <Col>
            {isAuthenticated ? null : (
              <div>
                <h2>Login</h2>
                {this.state.enableOtp ? null : (
                  <Search
                    placeholder={
                      this.state.mobile ? this.state.mobile : "Mobile Number"
                    }
                    allowClear
                    type="number"
                    // value={this.state.mobile}
                    enterButton={"Generate OTP"}
                    size="large"
                    onSearch={(e) => {
                      this.setState({ mobile: e === "" ?  this.state.mobile: e, enableOtp: true }, () => {
                        this.generateOtp();
                      });
                    }}
                  />
                )}
                {this.state.enableOtp ? (
                  <span>
                  <Search
                    placeholder="Enter OTP"
                    allowClear
                    type="number"
                    // value={this.state.zip}
                    enterButton={"Submit"}
                    size="large"
                    onSearch={(e) => {
                      this.setState({ otp: e }, () => {
                        this.verifyOtp();
                      });
                    }}
                  />
                  <Button danger onClick={e=>{this.setState({enableOtp: false})}} type="link">
                    Cancel
                  </Button>
                  </span>
                ) : null}
              </div>
            )}

            {isAuthenticated ? (
              <div>
                <h2>Beneficiaries</h2>
                {beneficiaries.length === 0 ? (
                  <p>
                    You do not have any benificiares added yet. Please login to{" "}
                    <a
                      href="https://www.cowin.gov.in/home"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Cowin
                    </a>{" "}
                    and add beneficiaries
                  </p>
                ) : (
                  <p>
                    Select beneficiaries to book a slot automatically when
                    there's availability. This app can continuously track
                    availability and make a booking.
                  </p>
                )}
                {this.state.beneficiaries.map((b) => {
                  return (
                    <Row>
                      <Checkbox
                        disabled={this.state.isWatchingAvailability}
                        checked={
                          selectedBeneficiaries.findIndex((sb) => {
                            return (
                              sb.beneficiary_reference_id ===
                              b.beneficiary_reference_id
                            );
                          }) !== -1
                        }
                        onClick={(e) => {
                          let sbs = this.state.selectedBeneficiaries;
                          let idx = sbs.findIndex((sb) => {
                            return (
                              sb.beneficiary_reference_id ===
                              b.beneficiary_reference_id
                            );
                          });
                          if (idx === -1) {
                            sbs.push(b);
                          } else {
                            sbs.splice(idx, 1);
                          }
                          this.setState({ selectedBeneficiaries: sbs });
                        }}
                      >
                        {b.name}
                      </Checkbox>
                    </Row>
                  );
                })}
              </div>
            ) : null}
            <h2 style={{ marginTop: 14, marginBottom: 0 }}>Booking Preferences</h2>
            <Row style={{ marginTop: 10 }}>
              <h3 style={{ marginTop: 10, marginBottom: 0 }}>Vaccine Type</h3>
              <Radio.Group
                style={{ marginTop: 12, marginLeft: 10 }}
                onChange={(e) => {
                  this.setState({ vaccineType: e.target.value });
                }}
                value={this.state.vaccineType}
                disabled={this.state.isWatchingAvailability}
              >
                <Radio value={"ANY"}>Any</Radio>
                <Radio value={"COVAXIN"}>Covaxin</Radio>
                <Radio value={"COVISHIELD"}>Covishield</Radio>
              </Radio.Group>
            </Row>

            <Row style={{ marginTop: 10 }}>
              <h3 style={{ marginTop: 10, marginBottom: 0 }}>Age Group</h3>
              <Radio.Group
                style={{ marginTop: 12, marginLeft: 10 }}
                onChange={this.setMinAge.bind(this)}
                value={this.state.minAge}
                disabled={this.state.isWatchingAvailability}
              >
                <Radio value={18}>18 to 45 Years</Radio>
                <Radio value={45}>45+ Years</Radio>
              </Radio.Group>
            </Row>

            <Row style={{ marginTop: 5 }}>
              <h3 style={{ marginTop: 10, marginBottom: 0 }}>Dose</h3>
              <Radio.Group
                style={{ marginTop: 12, marginLeft: 10 }}
                onChange={(e) => {
                  this.setState({ dose: e.target.value });
                }}
                defaultValue={1}
                value={this.state.dose}
                disabled={this.state.isWatchingAvailability}
              >
                <Radio value={1}>Dose 1</Radio>
                <Radio value={2}>Dose 2</Radio>
              </Radio.Group>
            </Row>

            <h2 style={{ marginTop: 15, marginBottom: 0 }}>Select Location for Tracking Availability</h2>
            <Tabs
              defaultActiveKey={this.state.selectedTab || "1"}
              onChange={(e) => {
                this.setState({ selectedTab: e });
              }}
            >
              <TabPane tab="Track By District" key={1}>
                <Select
                  style={{ width: 234 }}
                  size="large"
                  defaultValue={this.state.stateId}
                  onChange={this.selectState.bind(this)}
                  placeholder="Select State"
                >
                  {this.state.states.map((s) => {
                    return (
                      <Option key={s.state_id} value={s.state_id}>
                        {s.state_name}
                      </Option>
                    );
                  })}
                </Select>

                <Select
                  style={{ width: 234 }}
                  defaultValue={this.state.districtId}
                  size="large"
                  onChange={(val) => {
                    this.selectDistrict(val);
                  }}
                  placeholder="Select District"
                >
                  {this.state.districs.map((d) => {
                    return (
                      <Option key={d.district_id} value={d.district_id}>
                        {d.district_name}
                      </Option>
                    );
                  })}
                </Select>
                <Button
                  type="primary"
                  size="large"
                  loading={this.state.isWatchingAvailability}
                  onClick={(e) => this.initWatch()}
                >
                  {this.state.isWatchingAvailability
                    ? "Tracking"
                    : this.state.isAuthenticated
                    ? "Track Availability & Book"
                    : "Track Availability"}
                </Button>
                {this.state.isWatchingAvailability ? (
                  <Button
                    type="primary"
                    icon={<CloseCircleOutlined />}
                    size={"large"}
                    danger
                    onClick={this.clearWatch.bind(this)}
                  >
                    Stop
                  </Button>
                ) : null}
              </TabPane>
              <TabPane tab="Track By Pincode" key={2}>
                <Row>
                  <Search
                    disabled={this.state.isWatchingAvailability}
                    placeholder={
                      this.state.zip
                        ? this.state.zip
                        : "Enter your area pincode"
                    }
                    allowClear
                    type="number"
                    // value={this.state.zip}
                    enterButton={
                      this.state.isWatchingAvailability
                        ? `Tracking`
                        : this.state.isAuthenticated
                        ? "Track Availability & Book"
                        : "Track Availability"
                    }
                    size="large"
                    loading={this.state.isWatchingAvailability}
                    onSearch={(txt) => {
                      this.setState(
                        { zip: txt, isWatchingAvailability: true },
                        () => {
                          this.initWatch();
                        }
                      );
                    }}
                  />
                  {this.state.isWatchingAvailability ? (
                    <Button
                      type="primary"
                      icon={<CloseCircleOutlined />}
                      size={"large"}
                      danger
                      onClick={this.clearWatch.bind(this)}
                    >
                      Stop
                    </Button>
                  ) : null}
                </Row>
              </TabPane>
            </Tabs>

            {/* <Col>
              {this.state.isWatchingAvailability ? (
                <Button
                  type="primary"
                  icon={<CloseCircleOutlined />}
                  size={"large"}
                  danger
                  onClick={this.clearWatch.bind(this)}
                >
                  Stop
                </Button>
              ) : null}
            </Col> */}
          </Col>
        </Row>

        {vaccineCalendar && vaccineCalendar.centers
          ? this.renderTable(vaccineCalendar)
          : null}


          <div style={{marginTop: 10}}></div> 
          <Text code>Build last updated at: {version}</Text>
        {this.state.session && this.state.bookingCenter ? (
          <Modal
            title="Congrats!"
            visible={this.state.showSuccessModal}
            onOk={(e) => {
              this.setState({ showSuccessModal: false });
            }}
            onCancel={(e) => {
              this.setState({ showSuccessModal: false });
            }}
          >
            <p>
              You vaccine slot is booked for selected beneficiaries at{" "}
              {this.state.bookingCenter.name},{" "}
              {this.state.bookingCenter.block_name},{" "}
              {this.state.bookingCenter.address},{" "}
              {this.state.bookingCenter.district_name},{" "}
              {this.state.bookingCenter.state_name},{" "}
              {this.state.bookingCenter.pincode}
            </p>
            <p>Your appointment id is {this.state.appointment_id}</p>
            <p>
              You can login into{" "}
              <a
                href="https://www.cowin.gov.in/home"
                target="_blank"
                rel="noreferrer"
              >
                Cowin
              </a>{" "}
              to see details of your Vaccine slot
            </p>
          </Modal>
        ) : null}
      </div>
    );
  }
}
export default App;
