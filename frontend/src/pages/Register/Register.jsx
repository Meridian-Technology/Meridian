import RegisterForm from '../../components/Forms/RegisterForm/RegisterForm';
import Header from '../../components/Header/Header';
import './Register.scss';
import logo from '../../assets/Brand Image/BEACON.svg'

function Register(){
    return(
        <div className="main-register">
            <div className="block">
            </div>

            <div className="register-container">

            <img src={logo} alt="" className="logo"/>

                <RegisterForm />
            </div>
        </div>
    );
}

export default Register;